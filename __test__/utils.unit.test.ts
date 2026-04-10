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

  test('stripOrgPrefixFromTeams strips org prefixes correctly', async () => {
    const array = utils.stripOrgPrefixFromTeams([
      'org/team1',
      'org/team2',
      'team3'
    ])
    expect(array.length).toEqual(3)
    expect(array[0]).toEqual('team1')
    expect(array[1]).toEqual('team2')
    expect(array[2]).toEqual('team3')
  })

  test('getRepoPath successfully returns the path to the repository', async () => {
    expect(utils.getRepoPath()).toEqual(process.env['GITHUB_WORKSPACE'])
    expect(utils.getRepoPath('foo')).toEqual(
      path.resolve(process.env['GITHUB_WORKSPACE'] || '', 'foo')
    )
  })

  test('getRemoteUrl successfully returns remote URLs', async () => {
    const url1 = utils.getRemoteUrl(
      'HTTPS',
      'github.com',
      'peter-evans/create-pull-request'
    )
    expect(url1).toEqual('https://github.com/peter-evans/create-pull-request')

    const url2 = utils.getRemoteUrl(
      'SSH',
      'github.com',
      'peter-evans/create-pull-request'
    )
    expect(url2).toEqual('git@github.com:peter-evans/create-pull-request.git')

    const url3 = utils.getRemoteUrl(
      'HTTPS',
      'mygithubserver.com',
      'peter-evans/create-pull-request'
    )
    expect(url3).toEqual(
      'https://mygithubserver.com/peter-evans/create-pull-request'
    )
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

describe('retryWithBackoff', () => {
  const makeConsistencyError = () => {
    const error = new Error(
      'Validation Failed: "Could not resolve to a node with the global id of \'PR_abc123\'."'
    )
    ;(error as any).status = 422
    return error
  }

  const shouldRetry = (e: unknown): boolean =>
    e instanceof Error &&
    (e as any).status === 422 &&
    e.message.includes('Could not resolve to a node')

  test('succeeds on first attempt without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('success')
    const result = await utils.retryWithBackoff(fn, shouldRetry, 2, 1)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('retries on eventual consistency 422 and succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(makeConsistencyError())
      .mockResolvedValue('success')
    const result = await utils.retryWithBackoff(fn, shouldRetry, 2, 1)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('exhausts retries on persistent 422 and throws', async () => {
    const fn = jest.fn().mockRejectedValue(makeConsistencyError())
    await expect(utils.retryWithBackoff(fn, shouldRetry, 2, 1)).rejects.toThrow(
      'Could not resolve to a node'
    )
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  test('does not retry on non-422 errors', async () => {
    const error = new Error('Forbidden')
    ;(error as any).status = 403
    const fn = jest.fn().mockRejectedValue(error)
    await expect(utils.retryWithBackoff(fn, shouldRetry, 2, 1)).rejects.toThrow(
      'Forbidden'
    )
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('does not retry on 422 without the consistency error message', async () => {
    const error = new Error('Validation Failed: invalid label')
    ;(error as any).status = 422
    const fn = jest.fn().mockRejectedValue(error)
    await expect(utils.retryWithBackoff(fn, shouldRetry, 2, 1)).rejects.toThrow(
      'Validation Failed: invalid label'
    )
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('does not retry on plain Error objects', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Something broke'))
    await expect(utils.retryWithBackoff(fn, shouldRetry, 2, 1)).rejects.toThrow(
      'Something broke'
    )
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
