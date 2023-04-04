import * as core from '@actions/core'
import {Inputs, createPullRequest} from './create-pull-request'
import {inspect} from 'util'
import * as utils from './utils'

async function run(): Promise<void> {
  try {
    const inputs: Inputs = {
      token: core.getInput('token'),
      path: core.getInput('path'),
      addPaths: utils.getInputAsArray('add-paths'),
      commitMessage: core.getInput('commit-message'),
      committer: core.getInput('committer'),
      author: core.getInput('author'),
      signoff: core.getBooleanInput('signoff'),
      branch: core.getInput('branch'),
      deleteBranch: core.getBooleanInput('delete-branch'),
      branchSuffix: core.getInput('branch-suffix'),
      base: core.getInput('base'),
      pushToFork: core.getInput('push-to-fork'),
      title: core.getInput('title'),
      body: core.getInput('body'),
      bodyPath: core.getInput('body-path'),
      labels: utils.getInputAsArray('labels'),
      assignees: utils.getInputAsArray('assignees'),
      reviewers: utils.getInputAsArray('reviewers'),
      teamReviewers: utils.getInputAsArray('team-reviewers'),
      milestone: Number(core.getInput('milestone')),
      draft: core.getBooleanInput('draft')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    await createPullRequest(inputs)
  } catch (error) {
    core.setFailed(utils.getErrorMessage(error))
  }
}

run()
