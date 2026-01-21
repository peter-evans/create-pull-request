import {GitCommandManager} from '../lib/git-command-manager'
import {GitConfigHelper} from '../lib/git-config-helper'
import * as fs from 'fs'
import * as path from 'path'

const REPO_PATH = '/git/local/repos/test-base'

const extraheaderConfigKey = 'http.https://127.0.0.1/.extraheader'

describe('git-config-helper integration tests', () => {
  let git: GitCommandManager
  let originalRunnerTemp: string | undefined

  beforeAll(async () => {
    git = await GitCommandManager.create(REPO_PATH)
  })

  beforeEach(async () => {
    // Save original RUNNER_TEMP
    originalRunnerTemp = process.env['RUNNER_TEMP']
    // Create a temp directory for tests
    const tempDir = await fs.promises.mkdtemp('/tmp/cpr-test-')
    process.env['RUNNER_TEMP'] = tempDir
    process.env['GITHUB_WORKSPACE'] = REPO_PATH
  })

  afterEach(async () => {
    // Clean up RUNNER_TEMP
    const runnerTemp = process.env['RUNNER_TEMP']
    if (runnerTemp && runnerTemp.startsWith('/tmp/cpr-test-')) {
      await fs.promises.rm(runnerTemp, {recursive: true, force: true})
    }
    // Restore original RUNNER_TEMP
    if (originalRunnerTemp !== undefined) {
      process.env['RUNNER_TEMP'] = originalRunnerTemp
    } else {
      delete process.env['RUNNER_TEMP']
    }
  })

  it('tests save and restore with no persisted auth', async () => {
    const gitConfigHelper = await GitConfigHelper.create(git)
    await gitConfigHelper.close()
  })

  it('tests configure and removal of auth using credentials file', async () => {
    const runnerTemp = process.env['RUNNER_TEMP']!
    const gitConfigHelper = await GitConfigHelper.create(git)
    await gitConfigHelper.configureToken('github-token')

    // Verify credentials file was created in RUNNER_TEMP
    const files = await fs.promises.readdir(runnerTemp)
    const credentialsFiles = files.filter(
      f => f.startsWith('git-credentials-') && f.endsWith('.config')
    )
    expect(credentialsFiles.length).toBe(1)

    // Verify credentials file contains the auth token
    const credentialsPath = path.join(runnerTemp, credentialsFiles[0])
    const credentialsContent = await fs.promises.readFile(
      credentialsPath,
      'utf8'
    )
    expect(credentialsContent).toContain(
      'AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46Z2l0aHViLXRva2Vu'
    )

    // Verify includeIf entries were added to local config
    const includeIfKeys = await git.tryGetConfigKeys('^includeIf\\.gitdir:')
    expect(includeIfKeys.length).toBeGreaterThan(0)

    await gitConfigHelper.close()

    // Verify credentials file was removed
    const filesAfter = await fs.promises.readdir(runnerTemp)
    const credentialsFilesAfter = filesAfter.filter(
      f => f.startsWith('git-credentials-') && f.endsWith('.config')
    )
    expect(credentialsFilesAfter.length).toBe(0)

    // Verify includeIf entries were removed
    const includeIfKeysAfter = await git.tryGetConfigKeys(
      '^includeIf\\.gitdir:'
    )
    const credentialIncludes = []
    for (const key of includeIfKeysAfter) {
      const values = await git.tryGetConfigValues(key)
      for (const value of values) {
        if (/git-credentials-[0-9a-f-]+\.config$/i.test(value)) {
          credentialIncludes.push(value)
        }
      }
    }
    expect(credentialIncludes.length).toBe(0)
  })

  it('tests save and restore of persisted auth (old-style)', async () => {
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
