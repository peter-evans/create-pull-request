import * as core from '@actions/core'
import {GitCommandManager} from './git-command-manager'
import * as utils from './utils'

// Default the committer and author to the GitHub Actions bot
const DEFAULT_COMMITTER = 'GitHub <noreply@github.com>'
const DEFAULT_AUTHOR =
  'github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>'

interface GitIdentity {
  authorName: string
  authorEmail: string
  committerName: string
  committerEmail: string
}

export class GitIdentityHelper {
  private git: GitCommandManager

  constructor(git: GitCommandManager) {
    this.git = git
  }

  private async getGitIdentityFromConfig(): Promise<GitIdentity | undefined> {
    if (
      (await this.git.configExists('user.name')) &&
      (await this.git.configExists('user.email'))
    ) {
      const userName = await this.git.getConfigValue('user.name')
      const userEmail = await this.git.getConfigValue('user.email')
      return {
        authorName: userName,
        authorEmail: userEmail,
        committerName: userName,
        committerEmail: userEmail
      }
    }

    if (
      (await this.git.configExists('committer.name')) &&
      (await this.git.configExists('committer.email')) &&
      (await this.git.configExists('author.name')) &&
      (await this.git.configExists('author.email'))
    ) {
      const committerName = await this.git.getConfigValue('committer.name')
      const committerEmail = await this.git.getConfigValue('committer.email')
      const authorName = await this.git.getConfigValue('author.name')
      const authorEmail = await this.git.getConfigValue('author.email')
      return {
        authorName: authorName,
        authorEmail: authorEmail,
        committerName: committerName,
        committerEmail: committerEmail
      }
    }

    return undefined
  }

  async getIdentity(author: string, committer: string): Promise<GitIdentity> {
    // If either committer or author is supplied they will be cross used
    if (!committer && author) {
      core.info('Supplied author will also be used as the committer.')
      committer = author
    }
    if (!author && committer) {
      core.info('Supplied committer will also be used as the author.')
      author = committer
    }

    // If no committer/author has been supplied, try and fetch identity
    // configuration already existing in git config.
    if (!committer && !author) {
      const identity = await this.getGitIdentityFromConfig()
      if (identity) {
        core.info('Retrieved a pre-configured git identity.')
        return identity
      }
    }

    // Set defaults if no committer/author has been supplied and no
    // existing identity configuration was found.
    if (!committer && !author) {
      core.info('Action defaults set for the author and committer.')
      committer = DEFAULT_COMMITTER
      author = DEFAULT_AUTHOR
    }

    const parsedAuthor = utils.parseDisplayNameEmail(author)
    const parsedCommitter = utils.parseDisplayNameEmail(committer)
    return {
      authorName: parsedAuthor.name,
      authorEmail: parsedAuthor.email,
      committerName: parsedCommitter.name,
      committerEmail: parsedCommitter.email
    }
  }
}
