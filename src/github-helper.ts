import * as core from '@actions/core'
import {Inputs} from './create-pull-request'
import {Commit} from './git-command-manager'
import {Octokit, OctokitOptions} from './octokit-client'
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

type TreeObject = {
  path: string
  mode: '100644' | '100755' | '040000' | '160000' | '120000'
  sha: string | null
  type: 'blob'
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

  async pushSignedCommits(
    branchCommits: Commit[],
    repoPath: string,
    branchRepository: string,
    branch: string
  ): Promise<void> {
    let headSha = ''
    for (const commit of branchCommits) {
      headSha = await this.createCommit(commit, repoPath, branchRepository)
    }
    await this.createOrUpdateRef(branchRepository, branch, headSha)
  }

  private async createCommit(
    commit: Commit,
    repoPath: string,
    branchRepository: string
  ): Promise<string> {
    const repository = this.parseRepository(branchRepository)
    let treeSha = commit.tree
    if (commit.changes.length > 0) {
      core.info(`Creating tree objects for local commit ${commit.sha}`)
      const treeObjects = await Promise.all(
        commit.changes.map(async ({path, mode, status}) => {
          let sha: string | null = null
          if (status === 'A' || status === 'M') {
            core.info(`Creating blob for file '${path}'`)
            const {data: blob} = await this.octokit.rest.git.createBlob({
              ...repository,
              content: utils.readFileBase64([repoPath, path]),
              encoding: 'base64'
            })
            sha = blob.sha
          }
          return <TreeObject>{
            path,
            mode,
            sha,
            type: 'blob'
          }
        })
      )
      core.info(`Creating tree for local commit ${commit.sha}`)
      const {data: tree} = await this.octokit.rest.git.createTree({
        ...repository,
        base_tree: commit.parents[0],
        tree: treeObjects
      })
      treeSha = tree.sha
      core.info(`Created tree ${treeSha} for local commit ${commit.sha}`)
    }

    const {data: remoteCommit} = await this.octokit.rest.git.createCommit({
      ...repository,
      parents: commit.parents,
      tree: treeSha,
      message: `${commit.subject}\n\n${commit.body}`
    })
    core.info(
      `Created commit ${remoteCommit.sha} for local commit ${commit.sha}`
    )
    return remoteCommit.sha
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
}
