import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

export function getInputAsArray(
  name: string,
  options?: core.InputOptions
): string[] {
  return getStringAsArray(core.getInput(name, options))
}

export function getStringAsArray(str: string): string[] {
  return str
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(x => x !== '')
}

export function stripOrgPrefixFromTeams(teams: string[]): string[] {
  return teams.map(team => {
    const slashIndex = team.lastIndexOf('/')
    if (slashIndex > 0) {
      return team.substring(slashIndex + 1)
    }
    return team
  })
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

export function getRemoteUrl(
  protocol: string,
  hostname: string,
  repository: string
): string {
  return protocol == 'HTTPS'
    ? `https://${hostname}/${repository}`
    : `git@${hostname}:${repository}.git`
}

export function secondsSinceEpoch(): number {
  const now = new Date()
  return Math.round(now.getTime() / 1000)
}

export function randomString(): string {
  return Math.random().toString(36).substr(2, 7)
}

interface DisplayNameEmail {
  name: string
  email: string
}

export function parseDisplayNameEmail(
  displayNameEmail: string
): DisplayNameEmail {
  // Parse the name and email address from a string in the following format
  // Display Name <email@address.com>
  const pattern = /^([^<]+)\s*<([^>]+)>$/i

  // Check we have a match
  const match = displayNameEmail.match(pattern)
  if (!match) {
    throw new Error(
      `The format of '${displayNameEmail}' is not a valid email address with display name`
    )
  }

  // Check that name and email are not just whitespace
  const name = match[1].trim()
  const email = match[2].trim()
  if (!name || !email) {
    throw new Error(
      `The format of '${displayNameEmail}' is not a valid email address with display name`
    )
  }

  return {
    name: name,
    email: email
  }
}

export function fileExistsSync(path: string): boolean {
  if (!path) {
    throw new Error("Arg 'path' must not be empty")
  }

  let stats: fs.Stats
  try {
    stats = fs.statSync(path)
  } catch (error) {
    if (hasErrorCode(error) && error.code === 'ENOENT') {
      return false
    }

    throw new Error(
      `Encountered an error when checking whether path '${path}' exists: ${getErrorMessage(
        error
      )}`
    )
  }

  if (!stats.isDirectory()) {
    return true
  }

  return false
}

export function readFile(path: string): string {
  return fs.readFileSync(path, 'utf-8')
}

export function readFileBase64(pathParts: string[]): string {
  const resolvedPath = path.resolve(...pathParts)
  if (fs.lstatSync(resolvedPath).isSymbolicLink()) {
    return fs
      .readlinkSync(resolvedPath, {encoding: 'buffer'})
      .toString('base64')
  }
  return fs.readFileSync(resolvedPath).toString('base64')
}

/* eslint-disable  @typescript-eslint/no-explicit-any */
function hasErrorCode(error: any): error is {code: string} {
  return typeof (error && error.code) === 'string'
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}
