import * as core from '@actions/core'
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

interface RemoteDetail {
  protocol: string
  repository: string
}

export function getRemoteDetail(remoteUrl: string): RemoteDetail {
  // Parse the protocol and github repository from a URL
  // e.g. HTTPS, peter-evans/create-pull-request
  const httpsUrlPattern = /^https:\/\/.*@?github.com\/(.+\/.+)$/i
  const sshUrlPattern = /^git@github.com:(.+\/.+).git$/i

  const httpsMatch = remoteUrl.match(httpsUrlPattern)
  if (httpsMatch) {
    return {
      protocol: 'HTTPS',
      repository: httpsMatch[1]
    }
  }

  const sshMatch = remoteUrl.match(sshUrlPattern)
  if (sshMatch) {
    return {
      protocol: 'SSH',
      repository: sshMatch[1]
    }
  }

  throw new Error(
    `The format of '${remoteUrl}' is not a valid GitHub repository URL`
  )
}

export function getRemoteUrl(protocol: string, repository: string): string {
  return protocol == 'HTTPS'
    ? `https://github.com/${repository}`
    : `git@github.com:${repository}.git`
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
