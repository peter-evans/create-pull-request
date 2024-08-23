import * as core from '@actions/core'
import {
  createOrUpdateBranch,
  getWorkingBaseAndType,
  WorkingBaseType
} from './create-or-update-branch'
import {GitHubHelper} from './github-helper'
import {GitCommandManager} from './git-command-manager'
import {GitConfigHelper} from './git-config-helper'
import * as utils from './utils'

export interface Inputs {
  token: string
  branchToken: string
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
  signCommits: boolean
  title: string
  body: string
  bodyPath: string
  labels: string[]
  assignees: string[]
  reviewers: string[]
  teamReviewers: string[]
  milestone: number
  draft: {
    value: boolean
    always: boolean
  }
  maintainerCanModify: boolean
}

export async function createPullRequest(inputs: Inputs): Promise<void> {
  let gitConfigHelper, git
  try {
    core.startGroup('Prepare git configuration')
    const repoPath = utils.getRepoPath(inputs.path)
    git = await GitCommandManager.create(repoPath)
    gitConfigHelper = await GitConfigHelper.create(git)
    core.endGroup()

    core.startGroup('Determining the base and head repositories')
    const baseRemote = gitConfigHelper.getGitRemote()
    // Init the GitHub clients
    const ghBranch = new GitHubHelper(baseRemote.hostname, inputs.branchToken)
    const ghPull = new GitHubHelper(baseRemote.hostname, inputs.token)
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
      const baseParentRepository = await ghBranch.getRepositoryParent(
        baseRemote.repository
      )
      const branchParentRepository =
        await ghBranch.getRepositoryParent(branchRepository)
      if (branchParentRepository == null) {
        throw new Error(
          `Repository '${branchRepository}' is not a fork. Unable to continue.`
        )
      }
      if (
        branchParentRepository != baseRemote.repository &&
        baseParentRepository != branchParentRepository
      ) {
        throw new Error(
          `Repository '${branchRepository}' is not a fork of '${baseRemote.repository}', nor are they siblings. Unable to continue.`
        )
      }
      // Add a remote for the fork
      const remoteUrl = utils.getRemoteUrl(
        baseRemote.protocol,
        baseRemote.hostname,
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
      await gitConfigHelper.configureToken(inputs.branchToken)
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

    // Action outputs
    const outputs = new Map<string, string>()
    outputs.set('pull-request-branch', inputs.branch)
    outputs.set('pull-request-operation', 'none')

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
    outputs.set('pull-request-head-sha', result.headSha)
    // Set the base. It would have been '' if not specified as an input
    inputs.base = result.base
    core.endGroup()

    if (['created', 'updated'].includes(result.action)) {
      // The branch was created or updated
      core.startGroup(
        `Pushing pull request branch to '${branchRemoteName}/${inputs.branch}'`
      )
      if (inputs.signCommits) {
        // Create signed commits via the GitHub API
        const stashed = await git.stashPush(['--include-untracked'])
        await git.checkout(inputs.branch)
        const pushSignedCommitsResult = await ghBranch.pushSignedCommits(
          result.branchCommits,
          result.baseCommit,
          repoPath,
          branchRepository,
          inputs.branch
        )
        outputs.set('pull-request-head-sha', pushSignedCommitsResult.sha)
        outputs.set(
          'pull-request-commits-verified',
          pushSignedCommitsResult.verified.toString()
        )
        await git.checkout('-')
        if (stashed) {
          await git.stashPop()
        }
      } else {
        await git.push([
          '--force-with-lease',
          branchRemoteName,
          `${inputs.branch}:refs/heads/${inputs.branch}`
        ])
      }
      core.endGroup()
    }

    if (result.hasDiffWithBase) {
      core.startGroup('Create or update the pull request')
      const pull = await ghPull.createOrUpdatePullRequest(
        inputs,
        baseRemote.repository,
        branchRepository
      )
      outputs.set('pull-request-number', pull.number.toString())
      outputs.set('pull-request-url', pull.html_url)
      if (pull.created) {
        outputs.set('pull-request-operation', 'created')
      } else if (result.action == 'updated') {
        outputs.set('pull-request-operation', 'updated')
        // The pull request was updated AND the branch was updated.
        // Convert back to draft if 'draft: always-true' is set.
        if (inputs.draft.always && pull.draft !== undefined && !pull.draft) {
          await ghPull.convertToDraft(pull.node_id)
        }
      }
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
          outputs.set('pull-request-operation', 'closed')
        }
      }
    }

    core.startGroup('Setting outputs')
    // If the head commit is signed, get its verification status if we don't already know it.
    // This can happen if the branch wasn't updated (action = 'not-updated'), or GPG commit signing is in use.
    if (
      !outputs.has('pull-request-commits-verified') &&
      result.branchCommits.length > 0 &&
      result.branchCommits[result.branchCommits.length - 1].signed
    ) {
      // Using the local head commit SHA because in this case commits have not been pushed via the API.
      core.info(`Checking verification status of head commit ${result.headSha}`)
      try {
        const headCommit = await ghBranch.getCommit(
          result.headSha,
          branchRepository
        )
        outputs.set(
          'pull-request-commits-verified',
          headCommit.verified.toString()
        )
      } catch (error) {
        core.warning('Failed to check verification status of head commit.')
        core.debug(utils.getErrorMessage(error))
      }
    }
    if (!outputs.has('pull-request-commits-verified')) {
      outputs.set('pull-request-commits-verified', 'false')
    }

    // Set outputs
    for (const [key, value] of outputs) {
      core.info(`${key} = ${value}`)
      core.setOutput(key, value)
    }
    core.endGroup()
  } catch (error) {
    core.setFailed(utils.getErrorMessage(error))
  } finally {
    core.startGroup('Restore git configuration')
    if (inputs.pushToFork) {
      await git.exec(['remote', 'rm', 'fork'])
    }
    await gitConfigHelper.close()
    core.endGroup()
  }
}
