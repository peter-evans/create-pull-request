import * as core from '@actions/core'
import {Inputs} from './create-pull-request'
import {Octokit, OctokitOptions} from './octokit-client'

const ERROR_PR_REVIEW_FROM_AUTHOR =
  'Review cannot be requested from pull request author'

interface Repository {
  owner: string
  repo: string
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
  ): Promise<number> {
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
      return pull.number
    } catch (e) {
      if (
        !e.message ||
        !e.message.includes(`A pull request already exists for ${headBranch}`)
      ) {
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
    return pull.number
  }

  async createOrUpdatePullRequest(
    inputs: Inputs,
    headRepository: string
  ): Promise<void> {
    const {data: headRepo} = await this.octokit.repos.get({
      ...this.parseRepository(headRepository)
    })

    if (inputs.requestToParent && !headRepo.parent) {
      throw new Error(
        `The checked out repository is not a fork. Input 'request-to-parent' should be set to 'false'.`
      )
    }
    const baseRepository = inputs.requestToParent
      ? headRepo.parent.full_name
      : headRepository

    const headBranch = `${headRepo.owner.login}:${inputs.branch}`

    // Create or update the pull request
    const pullNumber = await this.createOrUpdate(
      inputs,
      baseRepository,
      headBranch
    )

    // Set output
    core.setOutput('pull-request-number', pullNumber)

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
        issue_number: pullNumber,
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
          pull_number: pullNumber,
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
