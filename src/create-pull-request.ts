import * as core from '@actions/core'
import {createOrUpdateBranch} from './create-or-update-branch'
import {GitHubHelper} from './github-helper'
import {GitCommandManager} from './git-command-manager'
import {GitAuthHelper} from './git-auth-helper'
import * as utils from './utils'

export interface Inputs {
  token: string
  path: string
  commitMessage: string
  committer: string
  author: string
  signoff: boolean
  branch: string
  branchSuffix: string
  base: string
  pushToFork: string
  title: string
  body: string
  labels: string[]
  assignees: string[]
  reviewers: string[]
  teamReviewers: string[]
  milestone: number
  draft: boolean
}

export async function createPullRequest(inputs: Inputs): Promise<void> {
  let gitAuthHelper
  try {
    // Get the repository path
    const repoPath = utils.getRepoPath(inputs.path)
    // Create a git command manager
    const git = await GitCommandManager.create(repoPath)

    // Save and unset the extraheader auth config if it exists
    core.startGroup('Save persisted git credentials')
    gitAuthHelper = new GitAuthHelper(git)
    await gitAuthHelper.savePersistedAuth()
    core.endGroup()

    // Init the GitHub client
    const githubHelper = new GitHubHelper(inputs.token)

    core.startGroup('Determining the base and head repositories')
    // Determine the base repository from git config
    const remoteUrl = await git.tryGetRemoteUrl()
    const baseRemote = utils.getRemoteDetail(remoteUrl)
    // Determine the head repository; the target for the pull request branch
    const branchRemoteName = inputs.pushToFork ? 'fork' : 'origin'
    const branchRepository = inputs.pushToFork
      ? inputs.pushToFork
      : baseRemote.repository
    if (inputs.pushToFork) {
      // Check if the supplied fork is really a fork of the base
      const parentRepository = await githubHelper.getRepositoryParent(
        branchRepository
      )
      if (parentRepository != baseRemote.repository) {
        throw new Error(
          `Repository '${branchRepository}' is not a fork of '${baseRemote.repository}'. Unable to continue.`
        )
      }
      // Add a remote for the fork
      const remoteUrl = utils.getRemoteUrl(
        baseRemote.protocol,
        branchRepository
      )
      await git.exec(['remote', 'add', 'fork', remoteUrl])
    }
    core.endGroup()
    core.info(
      `Pull request branch target repository set to ${branchRepository}`
    )

    // Configure auth
    if (baseRemote.protocol == 'HTTPS') {
      core.startGroup('Configuring credential for HTTPS authentication')
      await gitAuthHelper.configureToken(inputs.token)
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
    // If the base is not specified it is assumed to be the working base.
    const base = inputs.base ? inputs.base : workingBase
    // Throw an error if the base and branch are not different branches
    // of the 'origin' remote. An identically named branch in the `fork`
    // remote is perfectly fine.
    if (branchRemoteName == 'origin' && base == inputs.branch) {
      throw new Error(
        `The 'base' and 'branch' for a pull request must be different branches. Unable to continue.`
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

    // Configure the committer and author
    core.startGroup('Configuring the committer and author')
    const parsedAuthor = utils.parseDisplayNameEmail(inputs.author)
    const parsedCommitter = utils.parseDisplayNameEmail(inputs.committer)
    git.setIdentityGitOptions([
      '-c',
      `author.name=${parsedAuthor.name}`,
      '-c',
      `author.email=${parsedAuthor.email}`,
      '-c',
      `committer.name=${parsedCommitter.name}`,
      '-c',
      `committer.email=${parsedCommitter.email}`
    ])
    core.info(
      `Configured git committer as '${parsedCommitter.name} <${parsedCommitter.email}>'`
    )
    core.info(
      `Configured git author as '${parsedAuthor.name} <${parsedAuthor.email}>'`
    )
    core.endGroup()

    // Create or update the pull request branch
    core.startGroup('Create or update the pull request branch')
    const result = await createOrUpdateBranch(
      git,
      inputs.commitMessage,
      inputs.base,
      inputs.branch,
      branchRemoteName,
      inputs.signoff
    )
    core.endGroup()

    if (['created', 'updated'].includes(result.action)) {
      // The branch was created or updated
      core.startGroup(
        `Pushing pull request branch to '${branchRemoteName}/${inputs.branch}'`
      )
      await git.push([
        '--force-with-lease',
        branchRemoteName,
        `HEAD:refs/heads/${inputs.branch}`
      ])
      core.endGroup()

      // Set the base. It would have been '' if not specified as an input
      inputs.base = result.base

      if (result.hasDiffWithBase) {
        // Create or update the pull request
        await githubHelper.createOrUpdatePullRequest(
          inputs,
          baseRemote.repository,
          branchRepository
        )
      } else {
        // If there is no longer a diff with the base delete the branch
        core.info(
          `Branch '${inputs.branch}' no longer differs from base branch '${inputs.base}'`
        )
        core.info(`Closing pull request and deleting branch '${inputs.branch}'`)
        await git.push([
          '--delete',
          '--force',
          branchRemoteName,
          `refs/heads/${inputs.branch}`
        ])
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  } finally {
    // Remove auth and restore persisted auth config if it existed
    core.startGroup('Restore persisted git credentials')
    await gitAuthHelper.removeAuth()
    await gitAuthHelper.restorePersistedAuth()
    core.endGroup()
  }
}
