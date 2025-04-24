import * as core from '@actions/core'
import {Inputs} from './create-pull-request'
import {Commit, GitCommandManager} from './git-command-manager'
import {
  Octokit,
  OctokitOptions,
  throttleOptions,
  isGitea,
  getApiBaseUrl
} from './octokit-client'
import pLimit from 'p-limit'
import * as utils from './utils'

const ERROR_PR_ALREADY_EXISTS = 'A pull request already exists for'
const ERROR_PR_REVIEW_TOKEN_SCOPE =
  'Validation Failed: "Could not resolve to a node with the global id of'
const ERROR_PR_FORK_COLLAB = `Fork collab can't be granted by someone without permission`
const blobCreationLimit = pLimit(8)

interface Repository {
  owner: string
  repo: string
}

interface Pull {
  number: number
  html_url: string
  node_id: string
  draft?: boolean
  created: boolean
}

interface CommitResponse {
  sha: string
  tree: string
  verified: boolean
}

type TreeObject = {
  path: string
  mode: '100644' | '100755' | '040000' | '160000' | '120000'
  sha: string | null
  type: 'blob' | 'commit'
}

export class GitHubHelper {
  private octokit: InstanceType<typeof Octokit>
  private isGiteaInstance: boolean

  constructor(githubServerHostname: string, token: string) {
    const options: OctokitOptions = {}
    if (token) {
      options.auth = `${token}`
    }

    // Check if this is a Gitea instance
    this.isGiteaInstance = isGitea(githubServerHostname)

    // Set the appropriate API base URL for GitHub or Gitea
    options.baseUrl = getApiBaseUrl(githubServerHostname)

    if (this.isGiteaInstance) {
      core.info(
        `Detected Gitea instance at ${githubServerHostname}. Using API endpoint ${options.baseUrl}`
      )
    }

    options.throttle = throttleOptions
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

    // For Gitea, the head branch format is different - it's just the branch name
    const giteaHeadBranch = this.isGiteaInstance ? inputs.branch : headBranch

    // Try to create the pull request
    try {
      core.info(`Attempting creation of pull request`)
      const createParams = {
        ...this.parseRepository(baseRepository),
        title: inputs.title,
        head: this.isGiteaInstance ? giteaHeadBranch : headBranch,
        base: inputs.base,
        body: inputs.body,
        maintainer_can_modify: inputs.maintainerCanModify
      }

      // Add draft parameter only for GitHub (Gitea doesn't support draft PRs via the API)
      if (!this.isGiteaInstance) {
        Object.assign(createParams, {draft: inputs.draft.value})
      }

      // For Gitea, if using fork, we need to specify the head_repo
      if (this.isGiteaInstance && inputs.pushToFork) {
        Object.assign(createParams, {head_repo: headRepository})
      }

      const {data: pull} = await this.octokit.rest.pulls.create(createParams)

      core.info(
        `Created pull request #${pull.number} (${headBranch} => ${inputs.base})`
      )
      return {
        number: pull.number,
        html_url: pull.html_url,
        node_id: pull.node_id,
        draft: pull.draft,
        created: true
      }
    } catch (e) {
      const errorMessage = utils.getErrorMessage(e)
      if (errorMessage.includes(ERROR_PR_ALREADY_EXISTS)) {
        core.info(`A pull request already exists for ${headBranch}`)
      } else if (errorMessage.includes(ERROR_PR_FORK_COLLAB)) {
        core.warning(
          'An attempt was made to create a pull request using a token that does not have write access to the head branch.'
        )
        core.warning(
          `For this case, set input 'maintainer-can-modify' to 'false' to allow pull request creation.`
        )
        throw e
      } else {
        throw e
      }
    }

    // Update the pull request that exists for this branch and base
    core.info(`Fetching existing pull request`)
    const {data: pulls} = await this.octokit.rest.pulls.list({
      ...this.parseRepository(baseRepository),
      state: 'open',
      head: this.isGiteaInstance ? giteaHeadBranch : headBranch,
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
      node_id: pull.node_id,
      draft: pull.draft,
      created: false
    }
  }

  async getRepositoryParent(headRepository: string): Promise<string | null> {
    try {
      const {data: headRepo} = await this.octokit.rest.repos.get({
        ...this.parseRepository(headRepository)
      })

      if (!headRepo.parent) {
        return null
      }

      return headRepo.parent.full_name
    } catch (error) {
      // Gitea may not have the same parent repository structure
      // Fall back to null if this fails
      if (this.isGiteaInstance) {
        core.warning(
          `Unable to determine parent repository for ${headRepository}. This is expected for Gitea.`
        )
        return null
      }
      throw error
    }
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
      // Gitea has different assignee handling
      if (this.isGiteaInstance) {
        try {
          for (const assignee of inputs.assignees) {
            await this.octokit.request(
              'POST /repos/{owner}/{repo}/issues/{issue_number}/assignees',
              {
                ...this.parseRepository(baseRepository),
                issue_number: pull.number,
                assignees: [assignee]
              }
            )
          }
        } catch (error) {
          core.warning(
            `Error assigning users in Gitea: ${utils.getErrorMessage(error)}`
          )
        }
      } else {
        // GitHub standard API
        await this.octokit.rest.issues.addAssignees({
          ...this.parseRepository(baseRepository),
          issue_number: pull.number,
          assignees: inputs.assignees
        })
      }
    }

    // Skip reviewers functionality for Gitea as it might not be compatible
    if (
      !this.isGiteaInstance &&
      (inputs.reviewers.length > 0 || inputs.teamReviewers.length > 0)
    ) {
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
    } else if (
      this.isGiteaInstance &&
      (inputs.reviewers.length > 0 || inputs.teamReviewers.length > 0)
    ) {
      core.warning('Reviewer assignment is not supported for Gitea instances')
    }

    return pull
  }

  async pushSignedCommits(
    git: GitCommandManager,
    branchCommits: Commit[],
    baseCommit: Commit,
    repoPath: string,
    branchRepository: string,
    branch: string
  ): Promise<CommitResponse> {
    // For Gitea, fall back to standard Git push if signed commits are not supported
    if (this.isGiteaInstance) {
      core.warning(
        'Signed commits via API may not be fully supported in Gitea. Falling back to standard Git push.'
      )
      await git.push([
        '--force-with-lease',
        'origin',
        `${branch}:refs/heads/${branch}`
      ])

      // Return a simplified commit response
      return {
        sha: branchCommits[branchCommits.length - 1]?.sha || baseCommit.sha,
        tree: branchCommits[branchCommits.length - 1]?.tree || baseCommit.tree,
        verified: false
      }
    }

    // Original GitHub implementation
    let headCommit: CommitResponse = {
      sha: baseCommit.sha,
      tree: baseCommit.tree,
      verified: false
    }

    for (const commit of branchCommits) {
      headCommit = await this.createCommit(
        git,
        commit,
        headCommit,
        repoPath,
        branchRepository
      )
    }

    await this.createOrUpdateRef(branchRepository, branch, headCommit.sha)
    return headCommit
  }

  private async createCommit(
    git: GitCommandManager,
    commit: Commit,
    parentCommit: CommitResponse,
    repoPath: string,
    branchRepository: string
  ): Promise<CommitResponse> {
    const repository = this.parseRepository(branchRepository)
    // In the case of an empty commit, the tree references the parent's tree
    let treeSha = parentCommit.tree

    if (commit.changes.length > 0) {
      core.info(`Creating tree objects for local commit ${commit.sha}`)
      const treeObjects = await Promise.all(
        commit.changes.map(async ({path, mode, status, dstSha}) => {
          if (mode === '160000') {
            // submodule
            core.info(`Creating tree object for submodule commit at '${path}'`)
            return <TreeObject>{
              path,
              mode,
              sha: dstSha,
              type: 'commit'
            }
          } else {
            let sha: string | null = null
            if (status === 'A' || status === 'M') {
              try {
                const {data: blob} = await blobCreationLimit(async () =>
                  this.octokit.rest.git.createBlob({
                    ...repository,
                    content: await git.showFileAtRefBase64(commit.sha, path),
                    encoding: 'base64'
                  })
                )
                sha = blob.sha
              } catch (error) {
                core.error(
                  `Error creating blob for file '${path}': ${utils.getErrorMessage(error)}`
                )
                throw error
              }
            }
            core.info(
              `Creating tree object for blob at '${path}' with status '${status}'`
            )
            return <TreeObject>{
              path,
              mode,
              sha,
              type: 'blob'
            }
          }
        })
      )

      const chunkSize = 100
      const chunkedTreeObjects: TreeObject[][] = Array.from(
        {length: Math.ceil(treeObjects.length / chunkSize)},
        (_, i) => treeObjects.slice(i * chunkSize, i * chunkSize + chunkSize)
      )

      core.info(`Creating tree for local commit ${commit.sha}`)
      for (let i = 0; i < chunkedTreeObjects.length; i++) {
        const {data: tree} = await this.octokit.rest.git.createTree({
          ...repository,
          base_tree: treeSha,
          tree: chunkedTreeObjects[i]
        })
        treeSha = tree.sha
        if (chunkedTreeObjects.length > 1) {
          core.info(
            `Created tree ${treeSha} of multipart tree (${i + 1} of ${chunkedTreeObjects.length})`
          )
        }
      }
      core.info(`Created tree ${treeSha} for local commit ${commit.sha}`)
    }

    const {data: remoteCommit} = await this.octokit.rest.git.createCommit({
      ...repository,
      parents: [parentCommit.sha],
      tree: treeSha,
      message: `${commit.subject}\n\n${commit.body}`
    })

    core.info(
      `Created commit ${remoteCommit.sha} for local commit ${commit.sha}`
    )

    // Gitea might not have the same verification structure
    let verified = false
    if (
      remoteCommit.verification &&
      typeof remoteCommit.verification.verified !== 'undefined'
    ) {
      verified = remoteCommit.verification.verified
      core.info(
        `Commit verified: ${verified}; reason: ${remoteCommit.verification.reason || 'unknown'}`
      )
    } else {
      core.info('Commit verification information not available')
    }

    return {
      sha: remoteCommit.sha,
      tree: remoteCommit.tree.sha,
      verified: verified
    }
  }

  async getCommit(
    sha: string,
    branchRepository: string
  ): Promise<CommitResponse> {
    const repository = this.parseRepository(branchRepository)

    try {
      const {data: remoteCommit} = await this.octokit.rest.git.getCommit({
        ...repository,
        commit_sha: sha
      })

      // Handle different verification structure between GitHub and Gitea
      let verified = false
      if (
        remoteCommit.verification &&
        typeof remoteCommit.verification.verified !== 'undefined'
      ) {
        verified = remoteCommit.verification.verified
      }

      return {
        sha: remoteCommit.sha,
        tree: remoteCommit.tree.sha,
        verified: verified
      }
    } catch (error) {
      if (this.isGiteaInstance) {
        core.warning(
          `Unable to get commit details from Gitea. This might be expected: ${utils.getErrorMessage(error)}`
        )
        // Return a placeholder response
        return {
          sha: sha,
          tree: '', // We don't know the tree SHA
          verified: false
        }
      }
      throw error
    }
  }

  private async createOrUpdateRef(
    branchRepository: string,
    branch: string,
    newHead: string
  ) {
    const repository = this.parseRepository(branchRepository)

    // Check if branch exists
    let branchExists = false
    try {
      await this.octokit.rest.repos.getBranch({
        ...repository,
        branch: branch
      })
      branchExists = true
    } catch {
      branchExists = false
    }

    if (branchExists) {
      core.info(`Branch ${branch} exists; Updating ref`)
      await this.octokit.rest.git.updateRef({
        ...repository,
        sha: newHead,
        ref: `heads/${branch}`,
        force: true
      })
    } else {
      core.info(`Branch ${branch} does not exist; Creating ref`)
      try {
        await this.octokit.rest.git.createRef({
          ...repository,
          sha: newHead,
          ref: `refs/heads/${branch}`
        })
      } catch (error) {
        core.error(`Failed to create branch: ${utils.getErrorMessage(error)}`)
        throw error
      }
    }
  }

  async convertToDraft(id: string): Promise<void> {
    // Skip for Gitea since GraphQL API likely isn't compatible
    if (this.isGiteaInstance) {
      core.warning(
        'Draft pull requests are not supported in Gitea via the GraphQL API'
      )
      return
    }

    core.info(`Converting pull request to draft`)
    await this.octokit.graphql({
      query: `mutation($pullRequestId: ID!) {
        convertPullRequestToDraft(input: {pullRequestId: $pullRequestId}) {
          pullRequest {
            isDraft
          }
        }
      }`,
      pullRequestId: id
    })
  }
}
