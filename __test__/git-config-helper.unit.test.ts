import {GitConfigHelper} from '../lib/git-config-helper'

describe('git-config-helper unit tests', () => {
  test('parseGitRemote successfully parses HTTPS remote URLs', async () => {
    const remote1 = GitConfigHelper.parseGitRemote(
      'https://github.com/peter-evans/create-pull-request'
    )
    expect(remote1.hostname).toEqual('github.com')
    expect(remote1.protocol).toEqual('HTTPS')
    expect(remote1.repository).toEqual('peter-evans/create-pull-request')

    const remote2 = GitConfigHelper.parseGitRemote(
      'https://xxx:x-oauth-basic@github.com/peter-evans/create-pull-request'
    )
    expect(remote2.hostname).toEqual('github.com')
    expect(remote2.protocol).toEqual('HTTPS')
    expect(remote2.repository).toEqual('peter-evans/create-pull-request')

    const remote3 = GitConfigHelper.parseGitRemote(
      'https://github.com/peter-evans/create-pull-request.git'
    )
    expect(remote3.hostname).toEqual('github.com')
    expect(remote3.protocol).toEqual('HTTPS')
    expect(remote3.repository).toEqual('peter-evans/create-pull-request')

    const remote4 = GitConfigHelper.parseGitRemote(
      'https://github.com/peter-evans/ungit'
    )
    expect(remote4.hostname).toEqual('github.com')
    expect(remote4.protocol).toEqual('HTTPS')
    expect(remote4.repository).toEqual('peter-evans/ungit')

    const remote5 = GitConfigHelper.parseGitRemote(
      'https://github.com/peter-evans/ungit.git'
    )
    expect(remote5.hostname).toEqual('github.com')
    expect(remote5.protocol).toEqual('HTTPS')
    expect(remote5.repository).toEqual('peter-evans/ungit')

    const remote6 = GitConfigHelper.parseGitRemote(
      'https://github.internal.company/peter-evans/create-pull-request'
    )
    expect(remote6.hostname).toEqual('github.internal.company')
    expect(remote6.protocol).toEqual('HTTPS')
    expect(remote6.repository).toEqual('peter-evans/create-pull-request')
  })

  test('parseGitRemote successfully parses SSH remote URLs', async () => {
    const remote1 = GitConfigHelper.parseGitRemote(
      'git@github.com:peter-evans/create-pull-request.git'
    )
    expect(remote1.hostname).toEqual('github.com')
    expect(remote1.protocol).toEqual('SSH')
    expect(remote1.repository).toEqual('peter-evans/create-pull-request')

    const remote2 = GitConfigHelper.parseGitRemote(
      'git@github.com:peter-evans/ungit.git'
    )
    expect(remote2.hostname).toEqual('github.com')
    expect(remote2.protocol).toEqual('SSH')
    expect(remote2.repository).toEqual('peter-evans/ungit')

    const remote3 = GitConfigHelper.parseGitRemote(
      'git@github.internal.company:peter-evans/create-pull-request.git'
    )
    expect(remote3.hostname).toEqual('github.internal.company')
    expect(remote3.protocol).toEqual('SSH')
    expect(remote3.repository).toEqual('peter-evans/create-pull-request')
  })

  test('parseGitRemote successfully parses GIT remote URLs', async () => {
    // Unauthenticated git protocol for integration tests only
    const remote1 = GitConfigHelper.parseGitRemote(
      'git://127.0.0.1/repos/test-base.git'
    )
    expect(remote1.hostname).toEqual('127.0.0.1')
    expect(remote1.protocol).toEqual('GIT')
    expect(remote1.repository).toEqual('repos/test-base')
  })

  test('parseGitRemote fails to parse a remote URL', async () => {
    const remoteUrl = 'https://github.com/peter-evans'
    try {
      GitConfigHelper.parseGitRemote(remoteUrl)
      // Fail the test if an error wasn't thrown
      expect(true).toEqual(false)
    } catch (e: any) {
      expect(e.message).toEqual(
        `The format of '${remoteUrl}' is not a valid GitHub repository URL`
      )
    }
  })
})
