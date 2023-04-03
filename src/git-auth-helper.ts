import * as core from '@actions/core'
import * as fs from 'fs'
import {GitCommandManager} from './git-command-manager'
import * as path from 'path'
import {URL} from 'url'
import * as utils from './utils'

export class GitAuthHelper {
  private git: GitCommandManager
  private gitConfigPath = ''
  private workingDirectory: string
  private safeDirectoryConfigKey = 'safe.directory'
  private safeDirectoryAdded = false
  private extraheaderConfigKey: string
  private extraheaderConfigPlaceholderValue = 'AUTHORIZATION: basic ***'
  private extraheaderConfigValueRegex = '^AUTHORIZATION:'
  private persistedExtraheaderConfigValue = ''

  constructor(git: GitCommandManager) {
    this.git = git
    this.workingDirectory = this.git.getWorkingDirectory()
    const serverUrl = this.getServerUrl()
    this.extraheaderConfigKey = `http.${serverUrl.origin}/.extraheader`
  }

  async addSafeDirectory(): Promise<void> {
    const exists = await this.git.configExists(
      this.safeDirectoryConfigKey,
      this.workingDirectory,
      true
    )
    if (!exists) {
      await this.git.config(
        this.safeDirectoryConfigKey,
        this.workingDirectory,
        true,
        true
      )
      this.safeDirectoryAdded = true
    }
  }

  async removeSafeDirectory(): Promise<void> {
    if (this.safeDirectoryAdded) {
      await this.git.tryConfigUnset(
        this.safeDirectoryConfigKey,
        this.workingDirectory,
        true
      )
    }
  }

  async savePersistedAuth(): Promise<void> {
    // Save and unset persisted extraheader credential in git config if it exists
    this.persistedExtraheaderConfigValue = await this.getAndUnset()
  }

  async restorePersistedAuth(): Promise<void> {
    if (this.persistedExtraheaderConfigValue) {
      try {
        await this.setExtraheaderConfig(this.persistedExtraheaderConfigValue)
        core.info('Persisted git credentials restored')
      } catch (e) {
        core.warning(utils.getErrorMessage(e))
      }
    }
  }

  async configureToken(token: string): Promise<void> {
    // Encode and configure the basic credential for HTTPS access
    const basicCredential = Buffer.from(
      `x-access-token:${token}`,
      'utf8'
    ).toString('base64')
    core.setSecret(basicCredential)
    const extraheaderConfigValue = `AUTHORIZATION: basic ${basicCredential}`
    await this.setExtraheaderConfig(extraheaderConfigValue)
  }

  async removeAuth(): Promise<void> {
    await this.getAndUnset()
  }

  private async setExtraheaderConfig(
    extraheaderConfigValue: string
  ): Promise<void> {
    // Configure a placeholder value. This approach avoids the credential being captured
    // by process creation audit events, which are commonly logged. For more information,
    // refer to https://docs.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/command-line-process-auditing
    // See https://github.com/actions/checkout/blob/main/src/git-auth-helper.ts#L267-L274
    await this.git.config(
      this.extraheaderConfigKey,
      this.extraheaderConfigPlaceholderValue
    )
    // Replace the placeholder
    await this.gitConfigStringReplace(
      this.extraheaderConfigPlaceholderValue,
      extraheaderConfigValue
    )
  }

  private async getAndUnset(): Promise<string> {
    let configValue = ''
    // Save and unset persisted extraheader credential in git config if it exists
    if (
      await this.git.configExists(
        this.extraheaderConfigKey,
        this.extraheaderConfigValueRegex
      )
    ) {
      configValue = await this.git.getConfigValue(
        this.extraheaderConfigKey,
        this.extraheaderConfigValueRegex
      )
      if (
        await this.git.tryConfigUnset(
          this.extraheaderConfigKey,
          this.extraheaderConfigValueRegex
        )
      ) {
        core.info(`Unset config key '${this.extraheaderConfigKey}'`)
      } else {
        core.warning(
          `Failed to unset config key '${this.extraheaderConfigKey}'`
        )
      }
    }
    return configValue
  }

  private async gitConfigStringReplace(
    find: string,
    replace: string
  ): Promise<void> {
    if (this.gitConfigPath.length === 0) {
      const gitDir = await this.git.getGitDirectory()
      this.gitConfigPath = path.join(this.workingDirectory, gitDir, 'config')
    }
    let content = (await fs.promises.readFile(this.gitConfigPath)).toString()
    const index = content.indexOf(find)
    if (index < 0 || index != content.lastIndexOf(find)) {
      throw new Error(`Unable to replace '${find}' in ${this.gitConfigPath}`)
    }
    content = content.replace(find, replace)
    await fs.promises.writeFile(this.gitConfigPath, content)
  }

  private getServerUrl(): URL {
    return new URL(process.env['GITHUB_SERVER_URL'] || 'https://github.com')
  }
}
