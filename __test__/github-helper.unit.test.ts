jest.mock('../src/octokit-client', () => ({
  Octokit: class {},
  retryOptions: {},
  throttleOptions: {}
}))
jest.mock('@octokit/request-error', () => ({
  RequestError: class extends Error {}
}))
jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => (fn: () => unknown) => fn()
}))

import {GitHubHelper} from '../src/github-helper'
import type {Commit, GitCommandManager} from '../src/git-command-manager'

describe('GitHubHelper signed commit refs', () => {
  const createHelper = (returnedBranchName: string) => {
    const octokit = {
      rest: {
        repos: {
          getBranch: jest
            .fn()
            .mockResolvedValue({data: {name: returnedBranchName}})
        },
        git: {
          updateRef: jest.fn().mockResolvedValue({}),
          createRef: jest.fn().mockResolvedValue({})
        }
      }
    }
    const helper = new GitHubHelper('github.com', '')
    Object.defineProperty(helper, 'octokit', {value: octokit})
    return {helper, octokit}
  }

  const git = {} as GitCommandManager
  const baseCommit = {sha: 'base-sha', tree: 'tree-sha'} as Commit

  test('creates a ref when getBranch redirects to a renamed branch', async () => {
    const {helper, octokit} = createHelper('renamed-topic')

    await helper.pushSignedCommits(
      git,
      [],
      baseCommit,
      '',
      'owner/repo',
      'topic'
    )

    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      sha: 'base-sha',
      ref: 'refs/heads/topic'
    })
    expect(octokit.rest.git.updateRef).not.toHaveBeenCalled()
  })

  test('updates the ref when getBranch returns the requested branch', async () => {
    const {helper, octokit} = createHelper('topic')

    await helper.pushSignedCommits(
      git,
      [],
      baseCommit,
      '',
      'owner/repo',
      'topic'
    )

    expect(octokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      sha: 'base-sha',
      ref: 'heads/topic',
      force: true
    })
    expect(octokit.rest.git.createRef).not.toHaveBeenCalled()
  })
})
