import * as core from '@actions/core'
import {Inputs, createPullRequest} from './create-pull-request'
import {inspect} from 'util'
import * as utils from './utils'

async function run(): Promise<void> {
  try {
    const inputs: Inputs = {
      token: core.getInput('token'),
      path: core.getInput('path'),
      commitMessage: core.getInput('commit-message'),
      committer: core.getInput('committer'),
      author: core.getInput('author'),
      title: core.getInput('title'),
      body: core.getInput('body'),
      labels: utils.getInputAsArray('labels'),
      assignees: utils.getInputAsArray('assignees'),
      reviewers: utils.getInputAsArray('reviewers'),
      teamReviewers: utils.getInputAsArray('team-reviewers'),
      milestone: Number(core.getInput('milestone')),
      draft: core.getInput('draft') === 'true',
      branch: core.getInput('branch'),
      pushToFork: core.getInput('push-to-fork'),
      base: core.getInput('base'),
      branchSuffix: core.getInput('branch-suffix')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    await createPullRequest(inputs)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
