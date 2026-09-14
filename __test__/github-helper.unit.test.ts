import {GitHubHelper} from '../lib/github-helper'
import {Commit, GitCommandManager} from '../lib/git-command-manager'

const mockOctokit = {
  rest: {
    git: {
      createBlob: jest.fn(),
      createTree: jest.fn(),
      createCommit: jest.fn(),
      createRef: jest.fn()
    },
    repos: {
      getBranch: jest.fn()
    }
  }
}
jest.mock('../lib/octokit-client', () => ({
  Octokit: jest.fn(() => mockOctokit),
  throttleOptions: {},
  retryOptions: {}
}))
jest.mock('@octokit/request-error', () => ({RequestError: class {}}))
jest.mock('p-limit', () => () => (fn: () => unknown) => fn())

const NULL_SHA = '0000000000000000000000000000000000000000'

function makeCommit(changes: Commit['changes']): Commit {
  return {
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    tree: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    parents: ['cccccccccccccccccccccccccccccccccccccccc'],
    signed: false,
    subject: 'Test commit',
    body: '',
    changes,
    unparsedChanges: []
  }
}

describe('github-helper unit tests', () => {
  test('pushSignedCommits deletes a removed submodule instead of pointing it at the null sha', async () => {
    const {git: gitApi, repos: reposApi} = mockOctokit.rest
    gitApi.createBlob.mockResolvedValue({
      data: {sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'}
    })
    gitApi.createTree.mockResolvedValue({
      data: {sha: 'dddddddddddddddddddddddddddddddddddddddd'}
    })
    gitApi.createCommit.mockResolvedValue({
      data: {
        sha: 'ffffffffffffffffffffffffffffffffffffffff',
        tree: {sha: 'dddddddddddddddddddddddddddddddddddddddd'},
        verification: {verified: true, reason: 'valid'}
      }
    })
    gitApi.createRef.mockResolvedValue({})
    reposApi.getBranch.mockRejectedValue(new Error('Branch not found'))
    const git = {
      showFileAtRefBase64: jest.fn().mockResolvedValue('Y29udGVudA==')
    }

    const helper = new GitHubHelper('github.com', 'token')

    const baseCommit = makeCommit([])
    const commit = makeCommit([
      {
        mode: '160000',
        dstSha: NULL_SHA,
        status: 'D',
        path: 'submodules/removed'
      },
      {
        mode: '160000',
        dstSha: '1111111111111111111111111111111111111111',
        status: 'M',
        path: 'submodules/updated'
      },
      {
        mode: '100644',
        dstSha: '2222222222222222222222222222222222222222',
        status: 'M',
        path: '.gitmodules'
      }
    ])

    await helper.pushSignedCommits(
      git as unknown as GitCommandManager,
      [commit],
      baseCommit,
      '/repo',
      'owner/repo',
      'branch'
    )

    expect(gitApi.createTree).toHaveBeenCalledTimes(1)
    const {tree} = gitApi.createTree.mock.calls[0][0]
    expect(tree).toEqual([
      {
        path: 'submodules/removed',
        mode: '160000',
        sha: null,
        type: 'commit'
      },
      {
        path: 'submodules/updated',
        mode: '160000',
        sha: '1111111111111111111111111111111111111111',
        type: 'commit'
      },
      {
        path: '.gitmodules',
        mode: '100644',
        sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        type: 'blob'
      }
    ])
  })
})
