import * as core from '@actions/core'
import {Inputs} from './create-pull-request'
import {Octokit, OctokitOptions} from './octokit-client'

const ERROR_PR_REVIEW_FROM_AUTHOR =
  'Review cannot be requested from pull request author'

interface Repository {
  owner: string
  repo: string
}

interface Pull {
  number: number
  html_url: string
}

export class GitHubHelper {
  private octokit: InstanceType<typeof Octokit>

  constructor(token: string) {
    const options: OctokitOptions = {}
    if (token) {
      options.auth = `${token}`
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
    headBranch: string
  ): Promise<Pull> {
    // Try to create the pull request
    try {
      const {data: pull} = await this.octokit.pulls.create({
        ...this.parseRepository(baseRepository),
        title: inputs.title,
        head: headBranch,
        base: inputs.base,
        body: inputs.body,
        draft: inputs.draft
      })
      core.info(
        `Created pull request #${pull.number} (${headBranch} => ${inputs.base})`
      )
      return {
        number: pull.number,
        html_url: pull.html_url
      }
    } catch (e) {
      if (
        e.message &&
        e.message.includes(`A pull request already exists for ${headBranch}`)
      ) {
        core.info(`A pull request already exists for ${headBranch}`)
      } else {
        throw e
      }
    }

    // Update the pull request that exists for this branch and base
    const {data: pulls} = await this.octokit.pulls.list({
      ...this.parseRepository(baseRepository),
      state: 'open',
      head: headBranch,
      base: inputs.base
    })
    const {data: pull} = await this.octokit.pulls.update({
      ...this.parseRepository(baseRepository),
      pull_number: pulls[0].number,
      title: inputs.title,
      body: inputs.body,
      draft: inputs.draft
    })
    core.info(
      `Updated pull request #${pull.number} (${headBranch} => ${inputs.base})`
    )
    return {
      number: pull.number,
      html_url: pull.html_url
    }
  }

  async getRepositoryParent(headRepository: string): Promise<string> {
    const {data: headRepo} = await this.octokit.repos.get({
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
  ): Promise<void> {
    const [headOwner] = headRepository.split('/')
    const headBranch = `${headOwner}:${inputs.branch}`

    // Create or update the pull request
    const pull = await this.createOrUpdate(inputs, baseRepository, headBranch)

    // Set outputs
    core.startGroup('Setting outputs')
    core.setOutput('pull-request-number', pull.number)
    core.setOutput('pull-request-url', pull.html_url)
    // Deprecated
    core.exportVariable('PULL_REQUEST_NUMBER', pull.number)
    core.endGroup()

    // Set milestone, labels and assignees
    const updateIssueParams = {}
    if (inputs.milestone) {
      updateIssueParams['milestone'] = inputs.milestone
      core.info(`Applying milestone '${inputs.milestone}'`)
    }
    if (inputs.labels.length > 0) {
      updateIssueParams['labels'] = inputs.labels
      core.info(`Applying labels '${inputs.labels}'`)
    }
    if (inputs.assignees.length > 0) {
      updateIssueParams['assignees'] = inputs.assignees
      core.info(`Applying assignees '${inputs.assignees}'`)
    }
    if (Object.keys(updateIssueParams).length > 0) {
      await this.octokit.issues.update({
        ...this.parseRepository(baseRepository),
        issue_number: pull.number,
        ...updateIssueParams
      })
    }

    // Request reviewers and team reviewers
    const requestReviewersParams = {}
    if (inputs.reviewers.length > 0) {
      requestReviewersParams['reviewers'] = inputs.reviewers
      core.info(`Requesting reviewers '${inputs.reviewers}'`)
    }
    if (inputs.teamReviewers.length > 0) {
      requestReviewersParams['team_reviewers'] = inputs.teamReviewers
      core.info(`Requesting team reviewers '${inputs.teamReviewers}'`)
    }
    if (Object.keys(requestReviewersParams).length > 0) {
      try {
        await this.octokit.pulls.requestReviewers({
          ...this.parseRepository(baseRepository),
          pull_number: pull.number,
          ...requestReviewersParams
        })
      } catch (e) {
        if (e.message && e.message.includes(ERROR_PR_REVIEW_FROM_AUTHOR)) {
          core.warning(ERROR_PR_REVIEW_FROM_AUTHOR)
        } else {
          throw e
        }
      }
    }
  }
}
