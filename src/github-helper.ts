import * as core from '@actions/core'
import {Inputs} from './create-pull-request'
import {Commit} from './git-command-manager'
import {Octokit, OctokitOptions, throttleOptions} from './octokit-client'
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
        draft: inputs.draft.value,
        maintainer_can_modify: inputs.maintainerCanModify
      })
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
      node_id: pull.node_id,
      draft: pull.draft,
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

  async pushSignedCommits(
    branchCommits: Commit[],
    baseCommit: Commit,
    repoPath: string,
    branchRepository: string,
    branch: string
  ): Promise<CommitResponse> {
    let headCommit: CommitResponse = {
      sha: baseCommit.sha,
      tree: baseCommit.tree,
      verified: false
    }
    for (const commit of branchCommits) {
      headCommit = await this.createCommit(
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
                const {data: blob} = await blobCreationLimit(() =>
                  this.octokit.rest.git.createBlob({
                    ...repository,
                    content: utils.readFileBase64([repoPath, path]),
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
    core.info(
      `Commit verified: ${remoteCommit.verification.verified}; reason: ${remoteCommit.verification.reason}`
    )
    return {
      sha: remoteCommit.sha,
      tree: remoteCommit.tree.sha,
      verified: remoteCommit.verification.verified
    }
  }

  async getCommit(
    sha: string,
    branchRepository: string
  ): Promise<CommitResponse> {
    const repository = this.parseRepository(branchRepository)
    const {data: remoteCommit} = await this.octokit.rest.git.getCommit({
      ...repository,
      commit_sha: sha
    })
    return {
      sha: remoteCommit.sha,
      tree: remoteCommit.tree.sha,
      verified: remoteCommit.verification.verified
    }
  }

  private async createOrUpdateRef(
    branchRepository: string,
    branch: string,
    newHead: string
  ) {
    const repository = this.parseRepository(branchRepository)
    const branchExists = await this.octokit.rest.repos
      .getBranch({
        ...repository,
        branch: branch
      })
      .then(
        () => true,
        () => false
      )

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
      await this.octokit.rest.git.createRef({
        ...repository,
        sha: newHead,
        ref: `refs/heads/${branch}`
      })
    }
  }

  async convertToDraft(id: string): Promise<void> {
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
