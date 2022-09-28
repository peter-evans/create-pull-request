import * as path from 'path'
import * as utils from '../lib/utils'

const originalGitHubWorkspace = process.env['GITHUB_WORKSPACE']

describe('utils tests', () => {
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

  test('getStringAsArray splits string input by newlines and commas', async () => {
    const array = utils.getStringAsArray('1, 2, 3\n4, 5, 6')
    expect(array.length).toEqual(6)

    const array2 = utils.getStringAsArray('')
    expect(array2.length).toEqual(0)
  })

  test('getRepoPath successfully returns the path to the repository', async () => {
    expect(utils.getRepoPath()).toEqual(process.env['GITHUB_WORKSPACE'])
    expect(utils.getRepoPath('foo')).toEqual(
      path.resolve(process.env['GITHUB_WORKSPACE'] || '', 'foo')
    )
  })

  test('getRemoteDetail successfully parses remote URLs', async () => {
    const remote1 = utils.getRemoteDetail(
      'https://github.com/peter-evans/create-pull-request'
    )
    expect(remote1.protocol).toEqual('HTTPS')
    expect(remote1.repository).toEqual('peter-evans/create-pull-request')

    const remote2 = utils.getRemoteDetail(
      'https://xxx:x-oauth-basic@github.com/peter-evans/create-pull-request'
    )
    expect(remote2.protocol).toEqual('HTTPS')
    expect(remote2.repository).toEqual('peter-evans/create-pull-request')

    const remote3 = utils.getRemoteDetail(
      'git@github.com:peter-evans/create-pull-request.git'
    )
    expect(remote3.protocol).toEqual('SSH')
    expect(remote3.repository).toEqual('peter-evans/create-pull-request')

    const remote4 = utils.getRemoteDetail(
      'https://github.com/peter-evans/create-pull-request.git'
    )
    expect(remote4.protocol).toEqual('HTTPS')
    expect(remote4.repository).toEqual('peter-evans/create-pull-request')

    const remote5 = utils.getRemoteDetail(
      'https://github.com/peter-evans/ungit'
    )
    expect(remote5.protocol).toEqual('HTTPS')
    expect(remote5.repository).toEqual('peter-evans/ungit')

    const remote6 = utils.getRemoteDetail(
      'https://github.com/peter-evans/ungit.git'
    )
    expect(remote6.protocol).toEqual('HTTPS')
    expect(remote6.repository).toEqual('peter-evans/ungit')

    const remote7 = utils.getRemoteDetail(
      'git@github.com:peter-evans/ungit.git'
    )
    expect(remote7.protocol).toEqual('SSH')
    expect(remote7.repository).toEqual('peter-evans/ungit')
  })

  test('getRemoteDetail fails to parse a remote URL', async () => {
    const remoteUrl = 'https://github.com/peter-evans'
    try {
      utils.getRemoteDetail(remoteUrl)
      // Fail the test if an error wasn't thrown
      expect(true).toEqual(false)
    } catch (e: any) {
      expect(e.message).toEqual(
        `The format of '${remoteUrl}' is not a valid GitHub repository URL`
      )
    }
  })

  test('getRemoteUrl successfully returns remote URLs', async () => {
    const url1 = utils.getRemoteUrl('HTTPS', 'peter-evans/create-pull-request')
    expect(url1).toEqual('https://github.com/peter-evans/create-pull-request')

    const url2 = utils.getRemoteUrl('SSH', 'peter-evans/create-pull-request')
    expect(url2).toEqual('git@github.com:peter-evans/create-pull-request.git')
  })

  test('secondsSinceEpoch returns the number of seconds since the Epoch', async () => {
    const seconds = `${utils.secondsSinceEpoch()}`
    expect(seconds.length).toEqual(10)
  })

  test('randomString returns strings of length 7', async () => {
    for (let i = 0; i < 1000; i++) {
      expect(utils.randomString().length).toEqual(7)
    }
  })

  test('parseDisplayNameEmail successfully parses display name email formats', async () => {
    const parsed1 = utils.parseDisplayNameEmail('abc def <abc@def.com>')
    expect(parsed1.name).toEqual('abc def')
    expect(parsed1.email).toEqual('abc@def.com')

    const parsed2 = utils.parseDisplayNameEmail(
      'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>'
    )
    expect(parsed2.name).toEqual('github-actions[bot]')
    expect(parsed2.email).toEqual(
      '41898282+github-actions[bot]@users.noreply.github.com'
    )
  })

  test('parseDisplayNameEmail fails to parse display name email formats', async () => {
    const displayNameEmail1 = 'abc@def.com'
    try {
      utils.parseDisplayNameEmail(displayNameEmail1)
      // Fail the test if an error wasn't thrown
      expect(true).toEqual(false)
    } catch (e: any) {
      expect(e.message).toEqual(
        `The format of '${displayNameEmail1}' is not a valid email address with display name`
      )
    }

    const displayNameEmail2 = ' < >'
    try {
      utils.parseDisplayNameEmail(displayNameEmail2)
      // Fail the test if an error wasn't thrown
      expect(true).toEqual(false)
    } catch (e: any) {
      expect(e.message).toEqual(
        `The format of '${displayNameEmail2}' is not a valid email address with display name`
      )
    }
  })
})
