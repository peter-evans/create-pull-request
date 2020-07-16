import * as core from '@actions/core'
import {GitCommandManager} from './git-command-manager'

export class ConfigOption {
  name = ''
  value = ''
}

export class GitConfigHelper {
  private git: GitCommandManager

  constructor(git: GitCommandManager) {
    this.git = git
  }

  async addConfigOption(name: string, value: string): Promise<boolean> {
    const result = await this.git.exec(
      ['config', '--local', '--add', name, value],
      true
    )
    return result.exitCode === 0
  }

  async unsetConfigOption(name: string, valueRegex = '.'): Promise<boolean> {
    const result = await this.git.exec(
      ['config', '--local', '--unset', name, valueRegex],
      true
    )
    return result.exitCode === 0
  }

  async configOptionExists(name: string, valueRegex = '.'): Promise<boolean> {
    const result = await this.git.exec(
      ['config', '--local', '--name-only', '--get-regexp', name, valueRegex],
      true
    )
    return result.exitCode === 0
  }

  async getConfigOption(name: string, valueRegex = '.'): Promise<ConfigOption> {
    const option = new ConfigOption()
    const result = await this.git.exec(
      ['config', '--local', '--get-regexp', name, valueRegex],
      true
    )
    option.name = name
    option.value = result.stdout.trim().split(`${name} `)[1]
    return option
  }

  async getAndUnsetConfigOption(
    name: string,
    valueRegex = '.'
  ): Promise<ConfigOption> {
    if (await this.configOptionExists(name, valueRegex)) {
      const option = await this.getConfigOption(name, valueRegex)
      if (await this.unsetConfigOption(name, valueRegex)) {
        core.debug(`Unset config option '${name}'`)
        return option
      }
    }
    return new ConfigOption()
  }
}
