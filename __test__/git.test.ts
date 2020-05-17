import * as path from 'path'
import {
  ConfigOption,
  getRepoPath,
  execGit,
  addConfigOption,
  unsetConfigOption,
  configOptionExists,
  getConfigOption,
  getAndUnsetConfigOption
} from '../lib/git'

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

  test('execGit', async () => {
    const repoPath = getRepoPath()
    const result = await execGit(
      repoPath,
      ['config', '--local', '--name-only', '--get-regexp', 'remote.origin.url'],
      true
    )
    expect(result.exitCode).toEqual(0)
    expect(result.stdout.trim()).toEqual('remote.origin.url')
  })

  it('adds and unsets a config option', async () => {
    const repoPath = getRepoPath()
    const add = await addConfigOption(
      repoPath,
      'test.add.and.unset.config.option',
      'foo'
    )
    expect(add).toBeTruthy()
    const unset = await unsetConfigOption(
      repoPath,
      'test.add.and.unset.config.option'
    )
    expect(unset).toBeTruthy()
  })

  it('adds and unsets a config option with value regex', async () => {
    const repoPath = getRepoPath()
    const add = await addConfigOption(
      repoPath,
      'test.add.and.unset.config.option',
      'foo bar'
    )
    expect(add).toBeTruthy()
    const unset = await unsetConfigOption(
      repoPath,
      'test.add.and.unset.config.option',
      '^foo'
    )
    expect(unset).toBeTruthy()
  })

  test('configOptionExists returns true', async () => {
    const repoPath = getRepoPath()
    const result = await configOptionExists(repoPath, 'remote.origin.url')
    expect(result).toBeTruthy()
  })

  test('configOptionExists returns false', async () => {
    const repoPath = getRepoPath()
    const result = await configOptionExists(repoPath, 'this.key.does.not.exist')
    expect(result).toBeFalsy()
  })

  it('successfully retrieves a config option', async () => {
    const repoPath = getRepoPath()
    const add = await addConfigOption(repoPath, 'test.get.config.option', 'foo')
    expect(add).toBeTruthy()
    const option = await getConfigOption(repoPath, 'test.get.config.option')
    expect(option.value).toEqual('foo')
    const unset = await unsetConfigOption(repoPath, 'test.get.config.option')
    expect(unset).toBeTruthy()
  })

  it('gets a config option with value regex', async () => {
    const repoPath = getRepoPath()
    const add = await addConfigOption(
      repoPath,
      'test.get.config.option',
      'foo bar'
    )
    expect(add).toBeTruthy()
    const option = await getConfigOption(
      repoPath,
      'test.get.config.option',
      '^foo'
    )
    expect(option.value).toEqual('foo bar')
    const unset = await unsetConfigOption(
      repoPath,
      'test.get.config.option',
      '^foo'
    )
    expect(unset).toBeTruthy()
  })

  it('gets and unsets a config option', async () => {
    const repoPath = getRepoPath()
    const add = await addConfigOption(
      repoPath,
      'test.get.and.unset.config.option',
      'foo'
    )
    expect(add).toBeTruthy()
    const getAndUnset = await getAndUnsetConfigOption(
      repoPath,
      'test.get.and.unset.config.option'
    )
    expect(getAndUnset.value).toEqual('foo')
  })

  it('gets and unsets a config option with value regex', async () => {
    const repoPath = getRepoPath()
    const add = await addConfigOption(
      repoPath,
      'test.get.and.unset.config.option',
      'foo bar'
    )
    expect(add).toBeTruthy()
    const getAndUnset = await getAndUnsetConfigOption(
      repoPath,
      'test.get.and.unset.config.option',
      '^foo'
    )
    expect(getAndUnset.value).toEqual('foo bar')
  })

  it('fails to get and unset a config option', async () => {
    const repoPath = getRepoPath()
    const getAndUnset = await getAndUnsetConfigOption(
      repoPath,
      'this.key.does.not.exist'
    )
    expect(getAndUnset.name).toEqual('')
    expect(getAndUnset.value).toEqual('')
  })
})
