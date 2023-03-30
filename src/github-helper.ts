import * as core from '@actions/core'
import {Inputs} from './create-pull-request'
import {Octokit, OctokitOptions} from './octokit-client'
import * as utils from './utils'

const ERROR_PR_REVIEW_FROM_AUTHOR =
  'Review cannot be requested from pull request author'

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
    // if (inputs.teamReviewers.length > 0) {
    //   requestReviewersParams['team_reviewers'] = inputs.teamReviewers
    //   core.info(`Requesting team reviewers '${inputs.teamReviewers}'`)
    // }
    if (Object.keys(requestReviewersParams).length > 0) {
      try {
        await this.octokit.rest.pulls.requestReviewers({
          ...this.parseRepository(baseRepository),
          pull_number: pull.number,
          ...requestReviewersParams
        })
      } catch (e) {
        if (utils.getErrorMessage(e).includes(ERROR_PR_REVIEW_FROM_AUTHOR)) {
          core.warning(ERROR_PR_REVIEW_FROM_AUTHOR)
        } else {
          throw e
        }
      }
    }

    const orgs = inputs.teamReviewers.map(team => {
      if (!team.includes('/')) {
        throw new Error(
          `Team ${team} is not in the correct format. It should be in the format org/team`
        )
      }
      return team.split('/')[0]
    })
    const distinctOrgs = [...new Set(orgs)]
    core.debug(`distinctOrgs: ${distinctOrgs}`)

    const orgTeams = await Promise.all(
      distinctOrgs.map(org => this.getOrgTeams(org))
    )

    const teamIds = inputs.teamReviewers.map(team => {
      const [org, teamName] = team.split('/')
      const orgTeam = orgTeams.find(
        orgTeam => orgTeam.organization.login === org
      )
      if (!orgTeam) {
        throw new Error(`Org ${org} not found`)
      }
      const teamId = orgTeam.organization.teams.edges.find(
        team => team.node.slug === teamName
      )?.node.id
      if (!teamId) {
        throw new Error(`Team ${teamName} not found in ${org}`)
      }
      return teamId
    })
    core.debug(`teamIds: ${teamIds}`)

    if (teamIds.length > 0) {
      const repository = this.parseRepository(baseRepository)
      const pullNodeId = await this.getPullNodeId(
        repository.owner,
        repository.repo,
        pull.number
      )
      core.debug(`pullNodeId: ${pullNodeId}`)

      await this.requestReviewers(pullNodeId, teamIds)
    }

    return pull
  }

  async getOrgTeams(orgName: string): Promise<OrgTeams> {
    const query = `
      query($orgName: String!, $teamCount: Int!) {
        organization(login: $orgName) {
          login
          teams(first: $teamCount) {
            edges {
              node {
                id
                slug
              }
            }
          }
        }
      }
    `
    const teamCount = 100
    return this.octokit.graphql<OrgTeams>(query, {
      orgName,
      teamCount
    })
  }

  async getPullNodeId(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<string> {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: ${pullNumber}) {
            id
          }
        }
      }
    `

    return (
      await this.octokit.graphql<PullRequestResponse>(query, {
        owner,
        repo
      })
    ).repository.pullRequest.id
  }

  async requestReviewers(
    pullRequestId: string,
    teamIds: string[]
  ): Promise<void> {
    const mutation = `
      mutation($input: RequestReviewsInput!) {
        requestReviews(input: $input) {
          clientMutationId
        }
      }
    `

    await this.octokit
      .graphql(mutation, {
        input: {
          pullRequestId,
          teamIds: teamIds,
          union: true
        }
      })
      .then(response => {
        core.info('Reviews requested successfully')
      })
      .catch(error => {
        core.error(error)
      })
  }
}

interface OrgTeams {
  organization: {
    login: string
    teams: {
      edges: {
        node: {
          id: string
          slug: string
        }
      }[]
    }
  }
}

interface PullRequestResponse {
  repository: {
    pullRequest: {
      id: string
    }
  }
}
