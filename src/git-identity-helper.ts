import * as core from '@actions/core'
import {GitCommandManager} from './git-command-manager'
import {GitConfigHelper} from './git-config-helper'
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
    const gitConfigHelper = new GitConfigHelper(this.git)

    if (
      (await gitConfigHelper.configOptionExists('user.name')) &&
      (await gitConfigHelper.configOptionExists('user.email'))
    ) {
      const userName = await gitConfigHelper.getConfigOption('user.name')
      const userEmail = await gitConfigHelper.getConfigOption('user.email')
      return {
        authorName: userName.value,
        authorEmail: userEmail.value,
        committerName: userName.value,
        committerEmail: userEmail.value
      }
    }

    if (
      (await gitConfigHelper.configOptionExists('committer.name')) &&
      (await gitConfigHelper.configOptionExists('committer.email')) &&
      (await gitConfigHelper.configOptionExists('author.name')) &&
      (await gitConfigHelper.configOptionExists('author.email'))
    ) {
      const committerName = await gitConfigHelper.getConfigOption(
        'committer.name'
      )
      const committerEmail = await gitConfigHelper.getConfigOption(
        'committer.email'
      )
      const authorName = await gitConfigHelper.getConfigOption('author.name')
      const authorEmail = await gitConfigHelper.getConfigOption('author.email')
      return {
        authorName: authorName.value,
        authorEmail: authorEmail.value,
        committerName: committerName.value,
        committerEmail: committerEmail.value
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
