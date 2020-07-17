import * as core from '@actions/core'
import {createOrUpdateBranch} from './create-or-update-branch'
import {GitHubHelper} from './github-helper'
import {GitCommandManager} from './git-command-manager'
import {ConfigOption, GitConfigHelper} from './git-config-helper'
import {GitIdentityHelper} from './git-identity-helper'
import * as utils from './utils'

const EXTRAHEADER_OPTION = 'http.https://github.com/.extraheader'
const EXTRAHEADER_VALUE_REGEX = '^AUTHORIZATION:'

const DEFAULT_COMMIT_MESSAGE = '[create-pull-request] automated change'
const DEFAULT_TITLE = 'Changes by create-pull-request action'
const DEFAULT_BODY =
  'Automated changes by [create-pull-request](https://github.com/peter-evans/create-pull-request) GitHub action'
const DEFAULT_BRANCH = 'create-pull-request/patch'

export interface Inputs {
  token: string
  path: string
  commitMessage: string
  committer: string
  author: string
  title: string
  body: string
  labels: string[]
  assignees: string[]
  reviewers: string[]
  teamReviewers: string[]
  milestone: number
  draft: boolean
  branch: string
  requestToParent: boolean
  base: string
  branchSuffix: string
}

export async function createPullRequest(inputs: Inputs): Promise<void> {
  let gitConfigHelper
  let extraHeaderOption = new ConfigOption()
  try {
    // Get the repository path
    const repoPath = utils.getRepoPath(inputs.path)
    // Create a git command manager
    const git = await GitCommandManager.create(repoPath)

    // Unset and save the extraheader config option if it exists
    core.startGroup('Save persisted git credentials')
    gitConfigHelper = new GitConfigHelper(git)
    extraHeaderOption = await gitConfigHelper.getAndUnsetConfigOption(
      EXTRAHEADER_OPTION,
      EXTRAHEADER_VALUE_REGEX
    )
    core.endGroup()

    // Set defaults
    inputs.commitMessage = inputs.commitMessage
      ? inputs.commitMessage
      : DEFAULT_COMMIT_MESSAGE
    inputs.title = inputs.title ? inputs.title : DEFAULT_TITLE
    inputs.body = inputs.body ? inputs.body : DEFAULT_BODY
    inputs.branch = inputs.branch ? inputs.branch : DEFAULT_BRANCH

    // Determine the GitHub repository from git config
    // This will be the target repository for the pull request branch
    core.startGroup('Determining the checked out repository')
    const remoteOriginUrlConfig = await gitConfigHelper.getConfigOption(
      'remote.origin.url'
    )
    const remote = utils.getRemoteDetail(remoteOriginUrlConfig.value)
    core.endGroup()
    core.info(
      `Pull request branch target repository set to ${remote.repository}`
    )

    if (remote.protocol == 'HTTPS') {
      core.startGroup('Configuring credential for HTTPS authentication')
      // Encode and configure the basic credential for HTTPS access
      const basicCredential = Buffer.from(
        `x-access-token:${inputs.token}`,
        'utf8'
      ).toString('base64')
      core.setSecret(basicCredential)
      git.setAuthGitOptions([
        '-c',
        `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basicCredential}`
      ])
      core.endGroup()
    }

    // Determine if the checked out ref is a valid base for a pull request
    // The action needs the checked out HEAD ref to be a branch
    // This check will fail in the following cases:
    // - HEAD is detached
    // - HEAD is a merge commit (pull_request events)
    // - HEAD is a tag
    core.startGroup('Checking the checked out ref')
    const symbolicRefResult = await git.exec(
      ['symbolic-ref', 'HEAD', '--short'],
      true
    )
    if (symbolicRefResult.exitCode != 0) {
      core.debug(`${symbolicRefResult.stderr}`)
      throw new Error(
        'The checked out ref is not a valid base for a pull request. Unable to continue.'
      )
    }
    const workingBase = symbolicRefResult.stdout.trim()
    // Exit if the working base is a PR branch created by this action.
    // This may occur when using a PAT instead of GITHUB_TOKEN because
    // a PAT allows workflow actions to trigger further events.
    if (workingBase.startsWith(inputs.branch)) {
      throw new Error(
        `Working base branch '${workingBase}' was created by this action. Unable to continue.`
      )
    }
    core.endGroup()

    // Apply the branch suffix if set
    if (inputs.branchSuffix) {
      switch (inputs.branchSuffix) {
        case 'short-commit-hash':
          // Suffix with the short SHA1 hash
          inputs.branch = `${inputs.branch}-${await git.revParse('HEAD', [
            '--short'
          ])}`
          break
        case 'timestamp':
          // Suffix with the current timestamp
          inputs.branch = `${inputs.branch}-${utils.secondsSinceEpoch()}`
          break
        case 'random':
          // Suffix with a 7 character random string
          inputs.branch = `${inputs.branch}-${utils.randomString()}`
          break
        default:
          throw new Error(
            `Branch suffix '${inputs.branchSuffix}' is not a valid value. Unable to continue.`
          )
      }
    }

    // Output head branch
    core.info(
      `Pull request branch to create or update set to '${inputs.branch}'`
    )

    // Determine the committer and author
    core.startGroup('Configuring the committer and author')
    const gitIdentityHelper = new GitIdentityHelper(git)
    const identity = await gitIdentityHelper.getIdentity(
      inputs.author,
      inputs.committer
    )
    git.setIdentityGitOptions([
      '-c',
      `author.name=${identity.authorName}`,
      '-c',
      `author.email=${identity.authorEmail}`,
      '-c',
      `committer.name=${identity.committerName}`,
      '-c',
      `committer.email=${identity.committerEmail}`
    ])
    core.info(
      `Configured git committer as '${identity.committerName} <${identity.committerEmail}>'`
    )
    core.info(
      `Configured git author as '${identity.authorName} <${identity.authorEmail}>'`
    )
    core.endGroup()

    // Create or update the pull request branch
    core.startGroup('Create or update the pull request branch')
    const result = await createOrUpdateBranch(
      git,
      inputs.commitMessage,
      inputs.base,
      inputs.branch
    )
    core.endGroup()

    if (['created', 'updated'].includes(result.action)) {
      // The branch was created or updated
      core.startGroup(
        `Pushing pull request branch to 'origin/${inputs.branch}'`
      )
      await git.push([
        '--force-with-lease',
        'origin',
        `HEAD:refs/heads/${inputs.branch}`
      ])
      core.endGroup()

      // Set the base. It would have been '' if not specified as an input
      inputs.base = result.base

      if (result.hasDiffWithBase) {
        // Create or update the pull request
        const githubHelper = new GitHubHelper(inputs.token)
        await githubHelper.createOrUpdatePullRequest(inputs, remote.repository)
      } else {
        // If there is no longer a diff with the base delete the branch
        core.info(
          `Branch '${inputs.branch}' no longer differs from base branch '${inputs.base}'`
        )
        core.info(`Closing pull request and deleting branch '${inputs.branch}'`)
        await git.push([
          '--delete',
          '--force',
          'origin',
          `refs/heads/${inputs.branch}`
        ])
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  } finally {
    // Restore the extraheader config option
    core.startGroup('Restore persisted git credentials')
    if (extraHeaderOption.value != '') {
      if (
        await gitConfigHelper.addConfigOption(
          EXTRAHEADER_OPTION,
          extraHeaderOption.value
        )
      )
        core.debug(`Restored config option '${EXTRAHEADER_OPTION}'`)
    }
    core.endGroup()
  }
}
