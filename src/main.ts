import * as core from '@actions/core'
import {Inputs, createPullRequest} from './create-pull-request'
import {inspect} from 'util'
import * as utils from './utils'

function getDraftInput(): {value: boolean; always: boolean} {
  if (core.getInput('draft') === 'always-true') {
    return {value: true, always: true}
  } else {
    return {value: core.getBooleanInput('draft'), always: false}
  }
}

async function run(): Promise<void> {
  try {
    const inputs: Inputs = {
      token: core.getInput('token'),
      branchToken: core.getInput('branch-token'),
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
      signCommits: core.getBooleanInput('sign-commits'),
      title: core.getInput('title'),
      body: core.getInput('body'),
      bodyPath: core.getInput('body-path'),
      labels: utils.getInputAsArray('labels'),
      assignees: utils.getInputAsArray('assignees'),
      reviewers: utils.getInputAsArray('reviewers'),
      teamReviewers: utils.getInputAsArray('team-reviewers'),
      milestone: Number(core.getInput('milestone')),
      draft: getDraftInput(),
      maintainerCanModify: core.getBooleanInput('maintainer-can-modify')
    }
    core.debug(`Inputs: ${inspect(inputs)}`)

    if (!inputs.token) {
      throw new Error(`Input 'token' not supplied. Unable to continue.`)
    }
    if (!inputs.branchToken) {
      inputs.branchToken = inputs.token
    }
    if (inputs.bodyPath) {
      if (!utils.fileExistsSync(inputs.bodyPath)) {
        throw new Error(`File '${inputs.bodyPath}' does not exist.`)
      }
      // Update the body input with the contents of the file
      inputs.body = utils.readFile(inputs.bodyPath)
    }
    // 65536 characters is the maximum allowed for the pull request body.
    if (inputs.body.length > 65536) {
      core.warning(
        `Pull request body is too long. Truncating to 65536 characters.`
      )
      inputs.body = inputs.body.substring(0, 65536)
    }

    await createPullRequest(inputs)
  } catch (error) {
    core.setFailed(utils.getErrorMessage(error))
  }
}

run()
