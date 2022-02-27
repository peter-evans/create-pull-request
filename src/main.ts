import * as core from '@actions/core'
import {Inputs, createPullRequest} from './create-pull-request'
import {inspect} from 'util'

async function run(): Promise<void> {
  try {
    const inputs: Inputs = {
      token: core.getInput('token'),
      path: core.getInput('path'),
      addPaths: core.getMultilineInput('add-paths'),
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
      labels: core.getMultilineInput('labels'),
      assignees: core.getMultilineInput('assignees'),
      reviewers: core.getMultilineInput('reviewers'),
      teamReviewers: core.getMultilineInput('team-reviewers'),
      milestone: Number(core.getInput('milestone')),
      draft: core.getBooleanInput('draft')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    await createPullRequest(inputs)
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
