import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as utils from './utils'
import * as path from 'path'

const tagsRefSpec = '+refs/tags/*:refs/tags/*'

export class GitCommandManager {
  private gitPath: string
  private workingDirectory: string
  // Git options used when commands require an identity
  private identityGitOptions?: string[]

  private constructor(workingDirectory: string, gitPath: string) {
    this.workingDirectory = workingDirectory
    this.gitPath = gitPath
  }

  static async create(workingDirectory: string): Promise<GitCommandManager> {
    const gitPath = await io.which('git', true)
    return new GitCommandManager(workingDirectory, gitPath)
  }

  setIdentityGitOptions(identityGitOptions: string[]): void {
    this.identityGitOptions = identityGitOptions
  }

  async checkout(ref: string, startPoint?: string): Promise<void> {
    const args = ['checkout', '--progress']
    if (startPoint) {
      args.push('-B', ref, startPoint)
    } else {
      args.push(ref)
    }
    // https://github.com/git/git/commit/a047fafc7866cc4087201e284dc1f53e8f9a32d5
    args.push('--')
    await this.exec(args)
  }

  async cherryPick(
    options?: string[],
    allowAllExitCodes = false
  ): Promise<GitOutput> {
    const args = ['cherry-pick']
    if (this.identityGitOptions) {
      args.unshift(...this.identityGitOptions)
    }

    if (options) {
      args.push(...options)
    }

    return await this.exec(args, allowAllExitCodes)
  }

  async commit(
    options?: string[],
    allowAllExitCodes = false
  ): Promise<GitOutput> {
    const args = ['commit']
    if (this.identityGitOptions) {
      args.unshift(...this.identityGitOptions)
    }

    if (options) {
      args.push(...options)
    }

    return await this.exec(args, allowAllExitCodes)
  }

  async config(
    configKey: string,
    configValue: string,
    globalConfig?: boolean
  ): Promise<void> {
    await this.exec([
      'config',
      globalConfig ? '--global' : '--local',
      configKey,
      configValue
    ])
  }

  async configExists(
    configKey: string,
    configValue = '.',
    globalConfig?: boolean
  ): Promise<boolean> {
    const output = await this.exec(
      [
        'config',
        globalConfig ? '--global' : '--local',
        '--name-only',
        '--get-regexp',
        configKey,
        configValue
      ],
      true
    )
    return output.exitCode === 0
  }

  async fetch(
    refSpec: string[],
    remoteName?: string,
    options?: string[]
  ): Promise<void> {
    const args = ['-c', 'protocol.version=2', 'fetch']
    if (!refSpec.some(x => x === tagsRefSpec)) {
      args.push('--no-tags')
    }

    args.push('--progress', '--no-recurse-submodules')
    if (
      utils.fileExistsSync(path.join(this.workingDirectory, '.git', 'shallow'))
    ) {
      args.push('--unshallow')
    }

    if (options) {
      args.push(...options)
    }

    if (remoteName) {
      args.push(remoteName)
    } else {
      args.push('origin')
    }
    for (const arg of refSpec) {
      args.push(arg)
    }

    await this.exec(args)
  }

  async getConfigValue(configKey: string, configValue = '.'): Promise<string> {
    const output = await this.exec([
      'config',
      '--local',
      '--get-regexp',
      configKey,
      configValue
    ])
    return output.stdout.trim().split(`${configKey} `)[1]
  }

  getWorkingDirectory(): string {
    return this.workingDirectory
  }

  async hasDiff(options?: string[]): Promise<boolean> {
    const args = ['diff', '--quiet']
    if (options) {
      args.push(...options)
    }
    const output = await this.exec(args, true)
    return output.exitCode === 1
  }

  async isDirty(untracked: boolean, pathspec?: string[]): Promise<boolean> {
    const pathspecArgs = pathspec ? ['--', ...pathspec] : []
    // Check untracked changes
    const sargs = ['--porcelain', '-unormal']
    sargs.push(...pathspecArgs)
    if (untracked && (await this.status(sargs))) {
      return true
    }
    // Check working index changes
    if (await this.hasDiff(pathspecArgs)) {
      return true
    }
    // Check staged changes
    const dargs = ['--staged']
    dargs.push(...pathspecArgs)
    if (await this.hasDiff(dargs)) {
      return true
    }
    return false
  }

  async push(options?: string[]): Promise<void> {
    const args = ['push']
    if (options) {
      args.push(...options)
    }
    await this.exec(args)
  }

  async revList(
    commitExpression: string[],
    options?: string[]
  ): Promise<string> {
    const args = ['rev-list']
    if (options) {
      args.push(...options)
    }
    args.push(...commitExpression)
    const output = await this.exec(args)
    return output.stdout.trim()
  }

  async revParse(ref: string, options?: string[]): Promise<string> {
    const args = ['rev-parse']
    if (options) {
      args.push(...options)
    }
    args.push(ref)
    const output = await this.exec(args)
    return output.stdout.trim()
  }

  async status(options?: string[]): Promise<string> {
    const args = ['status']
    if (options) {
      args.push(...options)
    }
    const output = await this.exec(args)
    return output.stdout.trim()
  }

  async symbolicRef(ref: string, options?: string[]): Promise<string> {
    const args = ['symbolic-ref', ref]
    if (options) {
      args.push(...options)
    }
    const output = await this.exec(args)
    return output.stdout.trim()
  }

  async tryConfigUnset(
    configKey: string,
    configValue = '.',
    globalConfig?: boolean
  ): Promise<boolean> {
    const output = await this.exec(
      [
        'config',
        globalConfig ? '--global' : '--local',
        '--unset',
        configKey,
        configValue
      ],
      true
    )
    return output.exitCode === 0
  }

  async tryGetRemoteUrl(): Promise<string> {
    const output = await this.exec(
      ['config', '--local', '--get', 'remote.origin.url'],
      true
    )

    if (output.exitCode !== 0) {
      return ''
    }

    const stdout = output.stdout.trim()
    if (stdout.includes('\n')) {
      return ''
    }

    return stdout
  }

  async exec(args: string[], allowAllExitCodes = false): Promise<GitOutput> {
    const result = new GitOutput()

    const env = {}
    for (const key of Object.keys(process.env)) {
      env[key] = process.env[key]
    }

    const stdout: string[] = []
    const stderr: string[] = []

    const options = {
      cwd: this.workingDirectory,
      env,
      ignoreReturnCode: allowAllExitCodes,
      listeners: {
        stdout: (data: Buffer) => {
          stdout.push(data.toString())
        },
        stderr: (data: Buffer) => {
          stderr.push(data.toString())
        }
      }
    }

    result.exitCode = await exec.exec(`"${this.gitPath}"`, args, options)
    result.stdout = stdout.join('')
    result.stderr = stderr.join('')
    return result
  }
}

class GitOutput {
  stdout = ''
  stderr = ''
  exitCode = 0
}
