import * as core from '@actions/core'
import * as fs from 'fs'
import {GitCommandManager} from './git-command-manager'
import * as path from 'path'
import {URL} from 'url'
import * as utils from './utils'
import {v4 as uuid} from 'uuid'

interface GitRemote {
  hostname: string
  protocol: string
  repository: string
}

export class GitConfigHelper {
  private git: GitCommandManager
  private workingDirectory: string
  private safeDirectoryConfigKey = 'safe.directory'
  private safeDirectoryAdded = false
  private remoteUrl = ''
  private extraheaderConfigKey = ''
  private extraheaderConfigPlaceholderValue = 'AUTHORIZATION: basic ***'
  private extraheaderConfigValueRegex = '^AUTHORIZATION:'
  private persistedExtraheaderConfigValue = ''
  // Path to the credentials config file in RUNNER_TEMP (new v6-style auth)
  private credentialsConfigPath = ''

  private constructor(git: GitCommandManager) {
    this.git = git
    this.workingDirectory = this.git.getWorkingDirectory()
  }

  static async create(git: GitCommandManager): Promise<GitConfigHelper> {
    const gitConfigHelper = new GitConfigHelper(git)
    await gitConfigHelper.addSafeDirectory()
    await gitConfigHelper.fetchRemoteDetail()
    await gitConfigHelper.savePersistedAuth()
    return gitConfigHelper
  }

  async close(): Promise<void> {
    // Remove auth and restore persisted auth config if it existed
    await this.removeAuth()
    await this.restorePersistedAuth()
    await this.removeSafeDirectory()
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

  async fetchRemoteDetail(): Promise<void> {
    this.remoteUrl = await this.git.tryGetRemoteUrl()
  }

  getGitRemote(): GitRemote {
    return GitConfigHelper.parseGitRemote(this.remoteUrl)
  }

  static parseGitRemote(remoteUrl: string): GitRemote {
    const httpsUrlPattern = new RegExp(
      '^(https?)://(?:.+@)?(.+?)/(.+/.+?)(\\.git)?$',
      'i'
    )
    const httpsMatch = remoteUrl.match(httpsUrlPattern)
    if (httpsMatch) {
      return {
        hostname: httpsMatch[2],
        protocol: 'HTTPS',
        repository: httpsMatch[3]
      }
    }

    const sshUrlPattern = new RegExp('^git@(.+?):(.+/.+)\\.git$', 'i')
    const sshMatch = remoteUrl.match(sshUrlPattern)
    if (sshMatch) {
      return {
        hostname: sshMatch[1],
        protocol: 'SSH',
        repository: sshMatch[2]
      }
    }

    // Unauthenticated git protocol for integration tests only
    const gitUrlPattern = new RegExp('^git://(.+?)/(.+/.+)\\.git$', 'i')
    const gitMatch = remoteUrl.match(gitUrlPattern)
    if (gitMatch) {
      return {
        hostname: gitMatch[1],
        protocol: 'GIT',
        repository: gitMatch[2]
      }
    }

    throw new Error(
      `The format of '${remoteUrl}' is not a valid GitHub repository URL`
    )
  }

  async savePersistedAuth(): Promise<void> {
    const serverUrl = new URL(`https://${this.getGitRemote().hostname}`)
    this.extraheaderConfigKey = `http.${serverUrl.origin}/.extraheader`
    // Save and unset persisted extraheader credential in git config if it exists (old-style auth)
    // Note: checkout@v6 uses credentials files with includeIf, so we don't need to
    // manipulate those - they work independently via git's include mechanism
    this.persistedExtraheaderConfigValue = await this.getAndUnset()
  }

  async restorePersistedAuth(): Promise<void> {
    // Restore old-style extraheader config if it was persisted
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
    // Encode the basic credential for HTTPS access
    const basicCredential = Buffer.from(
      `x-access-token:${token}`,
      'utf8'
    ).toString('base64')
    core.setSecret(basicCredential)
    const extraheaderConfigValue = `AUTHORIZATION: basic ${basicCredential}`

    // Get or create the credentials config file path
    const credentialsConfigPath = this.getCredentialsConfigPath()

    // Write placeholder to the separate credentials config file using git config.
    // This approach avoids the credential being captured by process creation audit events,
    // which are commonly logged. For more information, refer to
    // https://docs.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/command-line-process-auditing
    await this.git.config(
      this.extraheaderConfigKey,
      this.extraheaderConfigPlaceholderValue,
      false, // globalConfig
      false, // add
      credentialsConfigPath
    )

    // Replace the placeholder in the credentials config file
    let content = (await fs.promises.readFile(credentialsConfigPath)).toString()
    const placeholderIndex = content.indexOf(
      this.extraheaderConfigPlaceholderValue
    )
    if (
      placeholderIndex < 0 ||
      placeholderIndex !=
        content.lastIndexOf(this.extraheaderConfigPlaceholderValue)
    ) {
      throw new Error(
        `Unable to replace auth placeholder in ${credentialsConfigPath}`
      )
    }
    content = content.replace(
      this.extraheaderConfigPlaceholderValue,
      extraheaderConfigValue
    )
    await fs.promises.writeFile(credentialsConfigPath, content)

    // Configure includeIf entries to reference the credentials config file
    await this.configureIncludeIf(credentialsConfigPath)
  }

  async removeAuth(): Promise<void> {
    // Remove old-style extraheader config if it exists
    await this.getAndUnset()

    // Remove includeIf entries that point to git-credentials-*.config files
    // and clean up the credentials config files
    await this.removeIncludeIfCredentials()
  }

  /**
   * Gets or creates the path to the credentials config file in RUNNER_TEMP.
   * @returns The absolute path to the credentials config file
   */
  private getCredentialsConfigPath(): string {
    if (this.credentialsConfigPath) {
      return this.credentialsConfigPath
    }

    const runnerTemp = process.env['RUNNER_TEMP'] || ''
    if (!runnerTemp) {
      throw new Error('RUNNER_TEMP is not defined')
    }

    // Create a unique filename for this action instance
    const configFileName = `git-credentials-${uuid()}.config`
    this.credentialsConfigPath = path.join(runnerTemp, configFileName)

    core.debug(`Credentials config path: ${this.credentialsConfigPath}`)
    return this.credentialsConfigPath
  }

  /**
   * Configures includeIf entries in the local git config to reference the credentials file.
   * Sets up entries for both host and container paths to support Docker container actions.
   */
  private async configureIncludeIf(
    credentialsConfigPath: string
  ): Promise<void> {
    // Host git directory
    const gitDir = await this.git.getGitDirectory()
    let hostGitDir = path.join(this.workingDirectory, gitDir)
    hostGitDir = hostGitDir.replace(/\\/g, '/') // Use forward slashes, even on Windows

    // Configure host includeIf
    const hostIncludeKey = `includeIf.gitdir:${hostGitDir}.path`
    await this.git.config(hostIncludeKey, credentialsConfigPath)

    // Configure host includeIf for worktrees
    const hostWorktreeIncludeKey = `includeIf.gitdir:${hostGitDir}/worktrees/*.path`
    await this.git.config(hostWorktreeIncludeKey, credentialsConfigPath)

    // Container paths for Docker container actions
    const githubWorkspace = process.env['GITHUB_WORKSPACE']
    if (githubWorkspace) {
      let relativePath = path.relative(githubWorkspace, this.workingDirectory)
      relativePath = relativePath.replace(/\\/g, '/') // Use forward slashes, even on Windows
      const containerGitDir = path.posix.join(
        '/github/workspace',
        relativePath,
        '.git'
      )

      // Container credentials config path
      const containerCredentialsPath = path.posix.join(
        '/github/runner_temp',
        path.basename(credentialsConfigPath)
      )

      // Configure container includeIf
      const containerIncludeKey = `includeIf.gitdir:${containerGitDir}.path`
      await this.git.config(containerIncludeKey, containerCredentialsPath)

      // Configure container includeIf for worktrees
      const containerWorktreeIncludeKey = `includeIf.gitdir:${containerGitDir}/worktrees/*.path`
      await this.git.config(
        containerWorktreeIncludeKey,
        containerCredentialsPath
      )
    }
  }

  /**
   * Removes the includeIf entry and credentials config file created by this action instance.
   * Only cleans up the specific credentials file tracked in this.credentialsConfigPath,
   * leaving credentials created by other actions (e.g., actions/checkout) intact.
   */
  private async removeIncludeIfCredentials(): Promise<void> {
    // Only clean up if this action instance created a credentials config file
    if (!this.credentialsConfigPath) {
      return
    }

    try {
      // Get all includeIf.gitdir keys from local config
      const keys = await this.git.tryGetConfigKeys('^includeIf\\.gitdir:')

      for (const key of keys) {
        // Get all values for this key
        const values = await this.git.tryGetConfigValues(key)
        for (const value of values) {
          // Only remove entries pointing to our specific credentials file
          if (value === this.credentialsConfigPath) {
            await this.git.tryConfigUnsetValue(key, value)
            core.debug(`Removed includeIf entry: ${key} = ${value}`)
          }
        }
      }
    } catch (e) {
      // Ignore errors during cleanup
      core.debug(`Error during includeIf cleanup: ${utils.getErrorMessage(e)}`)
    }

    // Delete only our credentials config file
    const runnerTemp = process.env['RUNNER_TEMP']
    const resolvedCredentialsPath = path.resolve(this.credentialsConfigPath)
    const resolvedRunnerTemp = runnerTemp ? path.resolve(runnerTemp) : ''
    if (
      resolvedRunnerTemp &&
      resolvedCredentialsPath.startsWith(resolvedRunnerTemp + path.sep)
    ) {
      try {
        await fs.promises.unlink(this.credentialsConfigPath)
        core.info(
          `Removed credentials config file: ${this.credentialsConfigPath}`
        )
      } catch (e) {
        core.debug(
          `Could not remove credentials file ${this.credentialsConfigPath}: ${utils.getErrorMessage(e)}`
        )
      }
    }
  }

  /**
   * Sets extraheader config directly in .git/config (old-style auth).
   * Used only for restoring persisted credentials from checkout@v4/v5.
   */
  private async setExtraheaderConfig(
    extraheaderConfigValue: string
  ): Promise<void> {
    // Configure a placeholder value. This approach avoids the credential being captured
    // by process creation audit events, which are commonly logged. For more information,
    // refer to https://docs.microsoft.com/en-us/windows-server/identity/ad-ds/manage/component-updates/command-line-process-auditing
    await this.git.config(
      this.extraheaderConfigKey,
      this.extraheaderConfigPlaceholderValue
    )
    // Replace the placeholder in the local git config
    const gitDir = await this.git.getGitDirectory()
    const gitConfigPath = path.join(this.workingDirectory, gitDir, 'config')
    let content = (await fs.promises.readFile(gitConfigPath)).toString()
    const index = content.indexOf(this.extraheaderConfigPlaceholderValue)
    if (
      index < 0 ||
      index != content.lastIndexOf(this.extraheaderConfigPlaceholderValue)
    ) {
      throw new Error(
        `Unable to replace '${this.extraheaderConfigPlaceholderValue}' in ${gitConfigPath}`
      )
    }
    content = content.replace(
      this.extraheaderConfigPlaceholderValue,
      extraheaderConfigValue
    )
    await fs.promises.writeFile(gitConfigPath, content)
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
}
