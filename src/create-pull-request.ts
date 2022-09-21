import * as core from '@actions/core'
import {
  createOrUpdateBranch,
  getWorkingBaseAndType,
  WorkingBaseType
} from './create-or-update-branch'
import {GitHubHelper} from './github-helper'
import {GitCommandManager} from './git-command-manager'
import {GitAuthHelper} from './git-auth-helper'
import * as utils from './utils'

export interface Inputs {
  token: string
  path: string
  addPaths: string[]
  commitMessage: string
  committer: string
  author: string
  signoff: boolean
  branch: string
  deleteBranch: boolean
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
      core.info(
        `Checking if '${branchRepository}' is a fork of '${baseRemote.repository}'`
      )
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

    core.startGroup('Checking the base repository state')
    const [workingBase, workingBaseType] = await getWorkingBaseAndType(git)
    core.info(`Working base is ${workingBaseType} '${workingBase}'`)
    // When in detached HEAD state (checked out on a commit), we need to
    // know the 'base' branch in order to rebase changes.
    if (workingBaseType == WorkingBaseType.Commit && !inputs.base) {
      throw new Error(
        `When the repository is checked out on a commit instead of a branch, the 'base' input must be supplied.`
      )
    }
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
    // For self-hosted runners the repository state persists between runs.
    // This command prunes the stale remote ref when the pull request branch was
    // deleted after being merged or closed. Without this the push using
    // '--force-with-lease' fails due to "stale info."
    // https://github.com/peter-evans/create-pull-request/issues/633
    await git.exec(['remote', 'prune', branchRemoteName])
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
      inputs.signoff,
      inputs.addPaths
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
    }

    // Set the base. It would have been '' if not specified as an input
    inputs.base = result.base

    if (result.hasDiffWithBase) {
      // Create or update the pull request
      core.startGroup('Create or update the pull request')
      const pull = await githubHelper.createOrUpdatePullRequest(
        inputs,
        baseRemote.repository,
        branchRepository
      )
      core.endGroup()

      // Set outputs
      core.startGroup('Setting outputs')
      core.setOutput('pull-request-number', pull.number)
      core.setOutput('pull-request-url', pull.html_url)
      if (pull.created) {
        core.setOutput('pull-request-operation', 'created')
      } else if (result.action == 'updated') {
        core.setOutput('pull-request-operation', 'updated')
      }
      core.setOutput('pull-request-head-sha', result.headSha)
      // Deprecated
      core.exportVariable('PULL_REQUEST_NUMBER', pull.number)
      core.endGroup()
    } else {
      // There is no longer a diff with the base
      // Check we are in a state where a branch exists
      if (['updated', 'not-updated'].includes(result.action)) {
        core.info(
          `Branch '${inputs.branch}' no longer differs from base branch '${inputs.base}'`
        )
        if (inputs.deleteBranch) {
          core.info(`Deleting branch '${inputs.branch}'`)
          await git.push([
            '--delete',
            '--force',
            branchRemoteName,
            `refs/heads/${inputs.branch}`
          ])
          // Set outputs
          core.startGroup('Setting outputs')
          core.setOutput('pull-request-operation', 'closed')
          core.endGroup()
        }
      }
    }
  } catch (error) {
    core.setFailed(utils.getErrorMessage(error))
  } finally {
    // Remove auth and restore persisted auth config if it existed
    core.startGroup('Restore persisted git credentials')
    await gitAuthHelper.removeAuth()
    await gitAuthHelper.restorePersistedAuth()
    core.endGroup()
  }
}
