import * as core from '@actions/core'
import {Inputs} from './create-pull-request'
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

export class GitHubHelper {
  private octokit: InstanceType<typeof Octokit>

  constructor(token: string) {
    const options: OctokitOptions = {}
    if (token) {
      options.auth = `${token}`
    }
    options.baseUrl = process.env['GITHUB_API_URL'] || 'https://api.github.com'
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
    const headBranchFull = `${headRepository}:${inputs.branch}`

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
      head: headBranchFull,
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

  async getRepositoryParent(headRepository: string): Promise<string> {
    const {data: headRepo} = await this.octokit.rest.repos.get({
      ...this.parseRepository(headRepository)
    })
    if (!headRepo.parent) {
      throw new Error(
        `Repository '${headRepository}' is not a fork. Unable to continue.`
      )
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
}
