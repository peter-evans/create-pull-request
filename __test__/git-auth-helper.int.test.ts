import {GitCommandManager} from '../lib/git-command-manager'
import {GitAuthHelper} from '../lib/git-auth-helper'

const REPO_PATH = '/git/local/test-base'

const extraheaderConfigKey = 'http.https://github.com/.extraheader'

describe('git-auth-helper tests', () => {
  let git: GitCommandManager
  let gitAuthHelper: GitAuthHelper

  beforeAll(async () => {
    git = await GitCommandManager.create(REPO_PATH)
    gitAuthHelper = new GitAuthHelper(git)
  })

  it('tests save and restore with no persisted auth', async () => {
    await gitAuthHelper.savePersistedAuth()
    await gitAuthHelper.restorePersistedAuth()
  })

  it('tests configure and removal of auth', async () => {
    await gitAuthHelper.configureToken('github-token')
    expect(await git.configExists(extraheaderConfigKey)).toBeTruthy()
    expect(await git.getConfigValue(extraheaderConfigKey)).toEqual(
      'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu'
    )

    await gitAuthHelper.removeAuth()
    expect(await git.configExists(extraheaderConfigKey)).toBeFalsy()
  })

  it('tests save and restore of persisted auth', async () => {
    const extraheaderConfigValue = 'AUTHORIZATION: basic ***persisted-auth***'
    await git.config(extraheaderConfigKey, extraheaderConfigValue)

    await gitAuthHelper.savePersistedAuth()

    const exists = await git.configExists(extraheaderConfigKey)
    expect(exists).toBeFalsy()

    await gitAuthHelper.restorePersistedAuth()

    const configValue = await git.getConfigValue(extraheaderConfigKey)
    expect(configValue).toEqual(extraheaderConfigValue)

    await gitAuthHelper.removeAuth()
  })

  it('tests adding and removing the safe.directory config', async () => {
    await git.config('safe.directory', '/another-value', true, true)

    await gitAuthHelper.removeSafeDirectory()
    await gitAuthHelper.addSafeDirectory()

    expect(
      await git.configExists('safe.directory', REPO_PATH, true)
    ).toBeTruthy()

    await gitAuthHelper.addSafeDirectory()
    await gitAuthHelper.removeSafeDirectory()

    expect(
      await git.configExists('safe.directory', REPO_PATH, true)
    ).toBeFalsy()
    expect(
      await git.configExists('safe.directory', '/another-value', true)
    ).toBeTruthy()
  })
})
