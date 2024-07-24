import * as core from '@actions/core'
import * as fs from 'fs'
import { graphql } from '@octokit/graphql'
import type { 
  Repository,
  Ref,
  Commit,
  FileChanges
} from '@octokit/graphql-schema'
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
  gitToken: string
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
  bodyPath: string
  labels: string[]
  assignees: string[]
  reviewers: string[]
  teamReviewers: string[]
  milestone: number
  draft: boolean
  signCommit: boolean
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
    // Init the GitHub client
    const githubHelper = new GitHubHelper(baseRemote.hostname, inputs.token)
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
      const baseParentRepository = await githubHelper.getRepositoryParent(
        baseRemote.repository
      )
      const branchParentRepository =
        await githubHelper.getRepositoryParent(branchRepository)
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
      await gitConfigHelper.configureToken(inputs.gitToken)
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
      if (inputs.signCommit) {
        core.info(`Use API to push a signed commit`)
        const graphqlWithAuth = graphql.defaults({
          headers: {
            authorization: 'token ' + inputs.token,
          },
        });

        let repoOwner = process.env.GITHUB_REPOSITORY!.split("/")[0]
        if (inputs.pushToFork) {
          const forkName = await githubHelper.getRepositoryParent(baseRemote.repository)
          if (!forkName) { repoOwner = forkName! }
        }
        const repoName = process.env.GITHUB_REPOSITORY!.split("/")[1]

        core.debug(`repoOwner: '${repoOwner}', repoName: '${repoName}'`)
        const refQuery = `
            query GetRefId($repoName: String!, $repoOwner: String!, $branchName: String!) {
              repository(owner: $repoOwner, name: $repoName){
                id
                ref(qualifiedName: $branchName){
                  id
                  name
                  prefix
                  target{
                    id
                    oid
                    commitUrl
                    commitResourcePath
                    abbreviatedOid
                  }
                }
              },
            }
          `

        let branchRef = await graphqlWithAuth<{repository: Repository}>(
          refQuery,
          {
            repoOwner: repoOwner,
            repoName: repoName,
            branchName: inputs.branch
          }
        )
        core.debug( `Fetched information for branch '${inputs.branch}' - '${JSON.stringify(branchRef)}'`)

        // if the branch does not exist, then first we need to create the branch from base
        if (branchRef.repository.ref == null) {
          core.debug( `Branch does not exist - '${inputs.branch}'`)
          branchRef = await graphqlWithAuth<{repository: Repository}>(
            refQuery,
            {
              repoOwner: repoOwner,
              repoName: repoName,
              branchName: inputs.base
            }
          )
          core.debug( `Fetched information for base branch '${inputs.base}' - '${JSON.stringify(branchRef)}'`)

          core.info( `Creating new branch '${inputs.branch}' from '${inputs.base}', with ref '${JSON.stringify(branchRef.repository.ref!.target!.oid)}'`)
          if (branchRef.repository.ref != null) {
            core.debug( `Send request for creating new branch`)
            const newBranchMutation = `
              mutation CreateNewBranch($branchName: String!, $oid: GitObjectID!, $repoId: ID!) {
                createRef(input: {
                  name: $branchName,
                  oid: $oid,
                  repositoryId: $repoId
                }) {
                  ref {
                    id
                    name
                    prefix
                  }
                }
              }
            `
            let newBranch = await graphqlWithAuth<{createRef: {ref: Ref}}>(
              newBranchMutation,
              {
                repoId: branchRef.repository.id,
                oid: branchRef.repository.ref.target!.oid,
                branchName: 'refs/heads/' + inputs.branch
              }
            )
            core.debug(`Created new branch '${inputs.branch}': '${JSON.stringify(newBranch.createRef.ref)}'`)
          }
        }
        core.info( `Hash ref of branch '${inputs.branch}' is '${JSON.stringify(branchRef.repository.ref!.target!.oid)}'`)

        // switch to input-branch for reading updated file contents
        await git.checkout(inputs.branch)

        let changedFiles = await git.getChangedFiles(branchRef.repository.ref!.target!.oid, ['--diff-filter=M'])
        let deletedFiles = await git.getChangedFiles(branchRef.repository.ref!.target!.oid, ['--diff-filter=D'])
        let fileChanges = <FileChanges>{additions: [], deletions: []}

        core.debug(`Changed files: '${JSON.stringify(changedFiles)}'`)
        core.debug(`Deleted files: '${JSON.stringify(deletedFiles)}'`)

        for (var file of changedFiles) {
          fileChanges.additions!.push({
            path: file,
            contents: btoa(fs.readFileSync(file, 'utf8')),
          })
        }

        for (var file of deletedFiles) {
          fileChanges.deletions!.push({
            path: file,
          })
        }

        const pushCommitMutation = `
          mutation PushCommit(
            $repoNameWithOwner: String!,
            $branchName: String!,
            $headOid: GitObjectID!,
            $commitMessage: String!,
            $fileChanges: FileChanges
          ) {
            createCommitOnBranch(input: {
              branch: {
                repositoryNameWithOwner: $repoNameWithOwner,
                branchName: $branchName,
              }
              fileChanges: $fileChanges
              message: {
                headline: $commitMessage
              }
              expectedHeadOid: $headOid
            }){
              clientMutationId
              ref{
                id
                name
                prefix
              }
              commit{
                id
                abbreviatedOid
                oid
              }
            }
          }
        `
        const pushCommitVars = {
          branchName: inputs.branch,
          repoNameWithOwner: repoOwner + '/' + repoName,
          headOid: branchRef.repository.ref!.target!.oid,
          commitMessage: inputs.commitMessage,
          fileChanges: fileChanges,
        }

        core.info(`Push commit with payload: '${JSON.stringify(pushCommitVars)}'`)

        const commit = await graphqlWithAuth<{createCommitOnBranch: {ref: Ref, commit: Commit} }>(
          pushCommitMutation,
          pushCommitVars,
        );

        core.debug( `Pushed commit - '${JSON.stringify(commit)}'`)
        core.info( `Pushed commit with hash - '${commit.createCommitOnBranch.commit.oid}' on branch - '${commit.createCommitOnBranch.ref.name}'`)

        // switch back to previous branch/state since we are done with reading the changed file contents
        await git.checkout('-')

      } else {
        await git.push([
          '--force-with-lease',
          branchRemoteName,
          `${inputs.branch}:refs/heads/${inputs.branch}`
        ])
      }
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
      core.setOutput('pull-request-branch', inputs.branch)
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
    core.startGroup('Restore git configuration')
    if (inputs.pushToFork) {
      await git.exec(['remote', 'rm', 'fork'])
    }
    await gitConfigHelper.close()
    core.endGroup()
  }
}
