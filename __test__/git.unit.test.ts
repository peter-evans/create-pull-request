import * as path from 'path'
import {getRepoPath} from '../lib/git'

const originalGitHubWorkspace = process.env['GITHUB_WORKSPACE']

describe('git tests', () => {
  beforeAll(() => {
    // GitHub workspace
    process.env['GITHUB_WORKSPACE'] = __dirname
  })

  afterAll(() => {
    // Restore GitHub workspace
    delete process.env['GITHUB_WORKSPACE']
    if (originalGitHubWorkspace) {
      process.env['GITHUB_WORKSPACE'] = originalGitHubWorkspace
    }
  })

  test('getRepoPath', async () => {
    expect(getRepoPath()).toEqual(process.env['GITHUB_WORKSPACE'])
    expect(getRepoPath('foo')).toEqual(
      path.resolve(process.env['GITHUB_WORKSPACE'] || '', 'foo')
    )
  })
})
