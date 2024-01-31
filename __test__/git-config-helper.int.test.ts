import {GitCommandManager} from '../lib/git-command-manager'
import {GitConfigHelper} from '../lib/git-config-helper'

const REPO_PATH = '/git/local/repos/test-base'

const extraheaderConfigKey = 'http.https://127.0.0.1/.extraheader'

describe('git-config-helper integration tests', () => {
  let git: GitCommandManager
  let gitConfigHelper: GitConfigHelper

  beforeAll(async () => {
    git = await GitCommandManager.create(REPO_PATH)
  })

  it('tests save and restore with no persisted auth', async () => {
    const gitConfigHelper = await GitConfigHelper.create(git)
    await gitConfigHelper.close()
  })

  it('tests configure and removal of auth', async () => {
    const gitConfigHelper = await GitConfigHelper.create(git)
    await gitConfigHelper.configureToken('github-token')
    expect(await git.configExists(extraheaderConfigKey)).toBeTruthy()
    expect(await git.getConfigValue(extraheaderConfigKey)).toEqual(
      'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu'
    )

    await gitConfigHelper.close()
    expect(await git.configExists(extraheaderConfigKey)).toBeFalsy()
  })

  it('tests save and restore of persisted auth', async () => {
    const extraheaderConfigValue = 'AUTHORIZATION: basic ***persisted-auth***'
    await git.config(extraheaderConfigKey, extraheaderConfigValue)

    const gitConfigHelper = await GitConfigHelper.create(git)

    const exists = await git.configExists(extraheaderConfigKey)
    expect(exists).toBeFalsy()

    await gitConfigHelper.close()

    const configValue = await git.getConfigValue(extraheaderConfigKey)
    expect(configValue).toEqual(extraheaderConfigValue)

    const unset = await git.tryConfigUnset(
      extraheaderConfigKey,
      '^AUTHORIZATION:'
    )
    expect(unset).toBeTruthy()
  })

  it('tests not adding/removing the safe.directory config when it already exists', async () => {
    await git.config('safe.directory', '/another-value', true, true)

    const gitConfigHelper = await GitConfigHelper.create(git)

    expect(
      await git.configExists('safe.directory', '/another-value', true)
    ).toBeTruthy()

    await gitConfigHelper.close()

    const unset = await git.tryConfigUnset(
      'safe.directory',
      '/another-value',
      true
    )
    expect(unset).toBeTruthy()
  })

  it('tests adding and removing the safe.directory config', async () => {
    const gitConfigHelper = await GitConfigHelper.create(git)

    expect(
      await git.configExists('safe.directory', REPO_PATH, true)
    ).toBeTruthy()

    await gitConfigHelper.close()

    expect(
      await git.configExists('safe.directory', REPO_PATH, true)
    ).toBeFalsy()
  })
})
