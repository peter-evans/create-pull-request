import * as core from '@actions/core'
import {Inputs} from './create-pull-request'
import {Octokit, OctokitOptions} from './octokit-client'
import type {
  Repository as TempRepository,
  Ref,
  Commit,
  FileChanges
} from '@octokit/graphql-schema'
import {BranchFileChanges} from './create-or-update-branch'
import * as utils from './utils'

const ERROR_PR_REVIEW_TOKEN_SCOPE =
  'Validation Failed: "Could not resolve to a node with the global id of'

interface Repository {
  owner: string
  repo: string
}

interface Pull {
  number: number
  html_url: string
  created: boolean
}

export class GitHubHelper {
  private octokit: InstanceType<typeof Octokit>

  constructor(githubServerHostname: string, token: string) {
    const options: OctokitOptions = {}
    if (token) {
      options.auth = `${token}`
    }
    if (githubServerHostname !== 'github.com') {
      options.baseUrl = `https://${githubServerHostname}/api/v3`
    } else {
      options.baseUrl = 'https://api.github.com'
    }
    this.octokit = new Octokit(options)
  }

  private parseRepository(repository: string): Repository {
    const [owner, repo] = repository.split('/')
    return {
      owner: owner,
      repo: repo
    }
  }

  private async createOrUpdate(
    inputs: Inputs,
    baseRepository: string,
    headRepository: string
  ): Promise<Pull> {
    const [headOwner] = headRepository.split('/')
    const headBranch = `${headOwner}:${inputs.branch}`

    // Try to create the pull request
    try {
      core.info(`Attempting creation of pull request`)
      const {data: pull} = await this.octokit.rest.pulls.create({
        ...this.parseRepository(baseRepository),
        title: inputs.title,
        head: headBranch,
        head_repo: headRepository,
        base: inputs.base,
        body: inputs.body,
        draft: inputs.draft
      })
      core.info(
        `Created pull request #${pull.number} (${headBranch} => ${inputs.base})`
      )
      return {
        number: pull.number,
        html_url: pull.html_url,
        created: true
      }
    } catch (e) {
      if (
        utils.getErrorMessage(e).includes(`A pull request already exists for`)
      ) {
        core.info(`A pull request already exists for ${headBranch}`)
      } else {
        throw e
      }
    }

    // Update the pull request that exists for this branch and base
    core.info(`Fetching existing pull request`)
    const {data: pulls} = await this.octokit.rest.pulls.list({
      ...this.parseRepository(baseRepository),
      state: 'open',
      head: headBranch,
      base: inputs.base
    })
    core.info(`Attempting update of pull request`)
    const {data: pull} = await this.octokit.rest.pulls.update({
      ...this.parseRepository(baseRepository),
      pull_number: pulls[0].number,
      title: inputs.title,
      body: inputs.body
    })
    core.info(
      `Updated pull request #${pull.number} (${headBranch} => ${inputs.base})`
    )
    return {
      number: pull.number,
      html_url: pull.html_url,
      created: false
    }
  }

  async getRepositoryParent(headRepository: string): Promise<string | null> {
    const {data: headRepo} = await this.octokit.rest.repos.get({
      ...this.parseRepository(headRepository)
    })
    if (!headRepo.parent) {
      return null
    }
    return headRepo.parent.full_name
  }

  async createOrUpdatePullRequest(
    inputs: Inputs,
    baseRepository: string,
    headRepository: string
  ): Promise<Pull> {
    // Create or update the pull request
    const pull = await this.createOrUpdate(
      inputs,
      baseRepository,
      headRepository
    )

    // Apply milestone
    if (inputs.milestone) {
      core.info(`Applying milestone '${inputs.milestone}'`)
      await this.octokit.rest.issues.update({
        ...this.parseRepository(baseRepository),
        issue_number: pull.number,
        milestone: inputs.milestone
      })
    }
    // Apply labels
    if (inputs.labels.length > 0) {
      core.info(`Applying labels '${inputs.labels}'`)
      await this.octokit.rest.issues.addLabels({
        ...this.parseRepository(baseRepository),
        issue_number: pull.number,
        labels: inputs.labels
      })
    }
    // Apply assignees
    if (inputs.assignees.length > 0) {
      core.info(`Applying assignees '${inputs.assignees}'`)
      await this.octokit.rest.issues.addAssignees({
        ...this.parseRepository(baseRepository),
        issue_number: pull.number,
        assignees: inputs.assignees
      })
    }

    // Request reviewers and team reviewers
    const requestReviewersParams = {}
    if (inputs.reviewers.length > 0) {
      requestReviewersParams['reviewers'] = inputs.reviewers
      core.info(`Requesting reviewers '${inputs.reviewers}'`)
    }
    if (inputs.teamReviewers.length > 0) {
      const teams = utils.stripOrgPrefixFromTeams(inputs.teamReviewers)
      requestReviewersParams['team_reviewers'] = teams
      core.info(`Requesting team reviewers '${teams}'`)
    }
    if (Object.keys(requestReviewersParams).length > 0) {
      try {
        await this.octokit.rest.pulls.requestReviewers({
          ...this.parseRepository(baseRepository),
          pull_number: pull.number,
          ...requestReviewersParams
        })
      } catch (e) {
        if (utils.getErrorMessage(e).includes(ERROR_PR_REVIEW_TOKEN_SCOPE)) {
          core.error(
            `Unable to request reviewers. If requesting team reviewers a 'repo' scoped PAT is required.`
          )
        }
        throw e
      }
    }

    return pull
  }

  async pushSignedCommit(
    branchRepository: string,
    branch: string,
    base: string,
    commitMessage: string,
    branchFileChanges?: BranchFileChanges
  ): Promise<void> {
    core.info(`Use API to push a signed commit`)

    const [repoOwner, repoName] = branchRepository.split('/')
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

    let branchRef = await this.octokit.graphql<{repository: TempRepository}>(
      refQuery,
      {
        repoOwner: repoOwner,
        repoName: repoName,
        branchName: branch
      }
    )
    core.debug(
      `Fetched information for branch '${branch}' - '${JSON.stringify(branchRef)}'`
    )

    const branchExists = branchRef.repository.ref != null

    // if the branch does not exist, then first we need to create the branch from base
    if (!branchExists) {
      core.debug(`Branch does not exist - '${branch}'`)
      branchRef = await this.octokit.graphql<{repository: TempRepository}>(
        refQuery,
        {
          repoOwner: repoOwner,
          repoName: repoName,
          branchName: base
        }
      )
      core.debug(
        `Fetched information for base branch '${base}' - '${JSON.stringify(branchRef)}'`
      )

      core.info(
        `Creating new branch '${branch}' from '${base}', with ref '${JSON.stringify(branchRef.repository.ref!.target!.oid)}'`
      )
      if (branchRef.repository.ref != null) {
        core.debug(`Send request for creating new branch`)
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
        const newBranch = await this.octokit.graphql<{createRef: {ref: Ref}}>(
          newBranchMutation,
          {
            repoId: branchRef.repository.id,
            oid: branchRef.repository.ref.target!.oid,
            branchName: 'refs/heads/' + branch
          }
        )
        core.debug(
          `Created new branch '${branch}': '${JSON.stringify(newBranch.createRef.ref)}'`
        )
      }
    }
    core.info(
      `Hash ref of branch '${branch}' is '${JSON.stringify(branchRef.repository.ref!.target!.oid)}'`
    )

    const fileChanges = <FileChanges>{
      additions: branchFileChanges!.additions,
      deletions: branchFileChanges!.deletions
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
      branchName: branch,
      repoNameWithOwner: repoOwner + '/' + repoName,
      headOid: branchRef.repository.ref!.target!.oid,
      commitMessage: commitMessage,
      fileChanges: fileChanges
    }

    const pushCommitVarsWithoutContents = {
      ...pushCommitVars,
      fileChanges: {
        ...pushCommitVars.fileChanges,
        additions: pushCommitVars.fileChanges.additions?.map(addition => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const {contents, ...rest} = addition
          return rest
        })
      }
    }

    core.debug(
      `Push commit with payload: '${JSON.stringify(pushCommitVarsWithoutContents)}'`
    )

    const commit = await this.octokit.graphql<{
      createCommitOnBranch: {ref: Ref; commit: Commit}
    }>(pushCommitMutation, pushCommitVars)

    core.debug(`Pushed commit - '${JSON.stringify(commit)}'`)
    core.info(
      `Pushed commit with hash - '${commit.createCommitOnBranch.commit.oid}' on branch - '${commit.createCommitOnBranch.ref.name}'`
    )

    if (branchExists) {
      // The branch existed so update the branch ref to point to the new commit
      // This is the same behavior as force pushing the branch
      core.info(
        `Updating branch '${branch}' to commit '${commit.createCommitOnBranch.commit.oid}'`
      )
      const updateBranchMutation = `
        mutation UpdateBranch($branchId: ID!, $commitOid: GitObjectID!) {
          updateRef(input: {
            refId: $branchId,
            oid: $commitOid,
            force: true
          }) {
            ref {
              id
              name
              prefix
            }
          }
        }
      `
      const updatedBranch = await this.octokit.graphql<{updateRef: {ref: Ref}}>(
        updateBranchMutation,
        {
          branchId: branchRef.repository.ref!.id,
          commitOid: commit.createCommitOnBranch.commit.oid
        }
      )
      core.debug(`Updated branch - '${JSON.stringify(updatedBranch)}'`)
    }
  }
}
