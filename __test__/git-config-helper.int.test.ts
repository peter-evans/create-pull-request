import {GitCommandManager} from '../lib/git-command-manager'
import {GitConfigHelper} from '../lib/git-config-helper'

const REPO_PATH = '/git/local/test-base'

const extraheaderConfigKey = 'http.https://github.com/.extraheader'

describe('git-config-helper integration tests', () => {
  let git: GitCommandManager
  let gitConfigHelper: GitConfigHelper

  beforeAll(async () => {
    git = await GitCommandManager.create(REPO_PATH)
    gitConfigHelper = await GitConfigHelper.create(git)
  })

  it('tests save and restore with no persisted auth', async () => {
    await gitConfigHelper.savePersistedAuth()
    await gitConfigHelper.restorePersistedAuth()
  })

  it('tests configure and removal of auth', async () => {
    await gitConfigHelper.configureToken('github-token')
    expect(await git.configExists(extraheaderConfigKey)).toBeTruthy()
    expect(await git.getConfigValue(extraheaderConfigKey)).toEqual(
      'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu'
    )

    await gitConfigHelper.removeAuth()
    expect(await git.configExists(extraheaderConfigKey)).toBeFalsy()
  })

  it('tests save and restore of persisted auth', async () => {
    const extraheaderConfigValue = 'AUTHORIZATION: basic ***persisted-auth***'
    await git.config(extraheaderConfigKey, extraheaderConfigValue)

    await gitConfigHelper.savePersistedAuth()

    const exists = await git.configExists(extraheaderConfigKey)
    expect(exists).toBeFalsy()

    await gitConfigHelper.restorePersistedAuth()

    const configValue = await git.getConfigValue(extraheaderConfigKey)
    expect(configValue).toEqual(extraheaderConfigValue)

    await gitConfigHelper.removeAuth()
  })

  it('tests adding and removing the safe.directory config', async () => {
    await git.config('safe.directory', '/another-value', true, true)

    await gitConfigHelper.removeSafeDirectory()
    await gitConfigHelper.addSafeDirectory()

    expect(
      await git.configExists('safe.directory', REPO_PATH, true)
    ).toBeTruthy()

    await gitConfigHelper.addSafeDirectory()
    await gitConfigHelper.removeSafeDirectory()

    expect(
      await git.configExists('safe.directory', REPO_PATH, true)
    ).toBeFalsy()
    expect(
      await git.configExists('safe.directory', '/another-value', true)
    ).toBeTruthy()
  })
})
