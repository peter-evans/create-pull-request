import {GitCommandManager} from '../lib/git-command-manager'
import {GitConfigHelper} from '../lib/git-config-helper'

const REPO_PATH = '/git/test-repo'

describe('git-config-helper tests', () => {
  let gitConfigHelper: GitConfigHelper

  beforeAll(async () => {
    const git = await GitCommandManager.create(REPO_PATH)
    gitConfigHelper = new GitConfigHelper(git)
  })

  it('adds and unsets a config option', async () => {
    const add = await gitConfigHelper.addConfigOption(
      'test.add.and.unset.config.option',
      'foo'
    )
    expect(add).toBeTruthy()
    const unset = await gitConfigHelper.unsetConfigOption(
      'test.add.and.unset.config.option'
    )
    expect(unset).toBeTruthy()
  })

  it('adds and unsets a config option with value regex', async () => {
    const add = await gitConfigHelper.addConfigOption(
      'test.add.and.unset.config.option',
      'foo bar'
    )
    expect(add).toBeTruthy()
    const unset = await gitConfigHelper.unsetConfigOption(
      'test.add.and.unset.config.option',
      '^foo'
    )
    expect(unset).toBeTruthy()
  })

  it('determines that a config option exists', async () => {
    const result = await gitConfigHelper.configOptionExists('remote.origin.url')
    expect(result).toBeTruthy()
  })

  it('determines that a config option does not exist', async () => {
    const result = await gitConfigHelper.configOptionExists(
      'this.key.does.not.exist'
    )
    expect(result).toBeFalsy()
  })

  it('successfully retrieves a config option', async () => {
    const add = await gitConfigHelper.addConfigOption(
      'test.get.config.option',
      'foo'
    )
    expect(add).toBeTruthy()
    const option = await gitConfigHelper.getConfigOption(
      'test.get.config.option'
    )
    expect(option.value).toEqual('foo')
    const unset = await gitConfigHelper.unsetConfigOption(
      'test.get.config.option'
    )
    expect(unset).toBeTruthy()
  })

  it('gets a config option with value regex', async () => {
    const add = await gitConfigHelper.addConfigOption(
      'test.get.config.option',
      'foo bar'
    )
    expect(add).toBeTruthy()
    const option = await gitConfigHelper.getConfigOption(
      'test.get.config.option',
      '^foo'
    )
    expect(option.value).toEqual('foo bar')
    const unset = await gitConfigHelper.unsetConfigOption(
      'test.get.config.option',
      '^foo'
    )
    expect(unset).toBeTruthy()
  })

  it('gets and unsets a config option', async () => {
    const add = await gitConfigHelper.addConfigOption(
      'test.get.and.unset.config.option',
      'foo'
    )
    expect(add).toBeTruthy()
    const getAndUnset = await gitConfigHelper.getAndUnsetConfigOption(
      'test.get.and.unset.config.option'
    )
    expect(getAndUnset.value).toEqual('foo')
  })

  it('gets and unsets a config option with value regex', async () => {
    const add = await gitConfigHelper.addConfigOption(
      'test.get.and.unset.config.option',
      'foo bar'
    )
    expect(add).toBeTruthy()
    const getAndUnset = await gitConfigHelper.getAndUnsetConfigOption(
      'test.get.and.unset.config.option',
      '^foo'
    )
    expect(getAndUnset.value).toEqual('foo bar')
  })

  it('fails to get and unset a config option', async () => {
    const getAndUnset = await gitConfigHelper.getAndUnsetConfigOption(
      'this.key.does.not.exist'
    )
    expect(getAndUnset.name).toEqual('')
    expect(getAndUnset.value).toEqual('')
  })
})
