import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as path from 'path'

class GitOutput {
  stdout = ''
  exitCode = 0
}

export class ConfigOption {
  name = ''
  value = ''
}

export function getRepoPath(relativePath?: string): string {
  let githubWorkspacePath = process.env['GITHUB_WORKSPACE']
  if (!githubWorkspacePath) {
    throw new Error('GITHUB_WORKSPACE not defined')
  }
  githubWorkspacePath = path.resolve(githubWorkspacePath)
  core.debug(`githubWorkspacePath: ${githubWorkspacePath}`)

  let repoPath = githubWorkspacePath
  if (relativePath) repoPath = path.resolve(repoPath, relativePath)

  core.debug(`repoPath: ${repoPath}`)
  return repoPath
}

export async function execGit(
  repoPath: string,
  args: string[],
  ignoreReturnCode = false
): Promise<GitOutput> {
  const result = new GitOutput()

  const stdout: string[] = []
  const options = {
    cwd: repoPath,
    ignoreReturnCode: ignoreReturnCode,
    listeners: {
      stdout: (data: Buffer): void => {
        stdout.push(data.toString())
      }
    }
  }

  result.exitCode = await exec.exec('git', args, options)
  result.stdout = stdout.join('')
  return result
}

export async function addConfigOption(repoPath, name, value): Promise<boolean> {
  const result = await execGit(
    repoPath,
    ['config', '--local', '--add', name, value],
    true
  )
  return result.exitCode === 0
}

export async function unsetConfigOption(
  repoPath,
  name,
  valueRegex = '.'
): Promise<boolean> {
  const result = await execGit(
    repoPath,
    ['config', '--local', '--unset', name, valueRegex],
    true
  )
  return result.exitCode === 0
}

export async function configOptionExists(
  repoPath,
  name,
  valueRegex = '.'
): Promise<boolean> {
  const result = await execGit(
    repoPath,
    ['config', '--local', '--name-only', '--get-regexp', name, valueRegex],
    true
  )
  return result.exitCode === 0
}

export async function getConfigOption(
  repoPath,
  name,
  valueRegex = '.'
): Promise<ConfigOption> {
  const option = new ConfigOption()
  const result = await execGit(
    repoPath,
    ['config', '--local', '--get-regexp', name, valueRegex],
    true
  )
  option.name = name
  option.value = result.stdout.trim().split(`${name} `)[1]
  return option
}

export async function getAndUnsetConfigOption(
  repoPath,
  name,
  valueRegex = '.'
): Promise<ConfigOption> {
  if (await configOptionExists(repoPath, name, valueRegex)) {
    const option = await getConfigOption(repoPath, name, valueRegex)
    if (await unsetConfigOption(repoPath, name, valueRegex)) {
      core.debug(`Unset config option '${name}'`)
      return option
    }
  }
  return new ConfigOption()
}
