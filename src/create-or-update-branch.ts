import * as core from '@actions/core'
import {GitCommandManager} from './git-command-manager'
import {v4 as uuidv4} from 'uuid'

const CHERRYPICK_EMPTY =
  'The previous cherry-pick is now empty, possibly due to conflict resolution.'

export async function tryFetch(
  git: GitCommandManager,
  remote: string,
  branch: string
): Promise<boolean> {
  try {
    await git.fetch([`${branch}:refs/remotes/${remote}/${branch}`], remote)
    return true
  } catch {
    return false
  }
}

// Return true if branch2 is ahead of branch1
async function isAhead(
  git: GitCommandManager,
  branch1: string,
  branch2: string
): Promise<boolean> {
  const result = await git.revList(
    [`${branch1}...${branch2}`],
    ['--right-only', '--count']
  )
  return Number(result) > 0
}

// Return true if branch2 is behind branch1
async function isBehind(
  git: GitCommandManager,
  branch1: string,
  branch2: string
): Promise<boolean> {
  const result = await git.revList(
    [`${branch1}...${branch2}`],
    ['--left-only', '--count']
  )
  return Number(result) > 0
}

// Return true if branch2 is even with branch1
async function isEven(
  git: GitCommandManager,
  branch1: string,
  branch2: string
): Promise<boolean> {
  return (
    !(await isAhead(git, branch1, branch2)) &&
    !(await isBehind(git, branch1, branch2))
  )
}

async function hasDiff(
  git: GitCommandManager,
  branch1: string,
  branch2: string
): Promise<boolean> {
  const result = await git.diff([`${branch1}..${branch2}`])
  return result.length > 0
}

function splitLines(multilineString: string): string[] {
  return multilineString
    .split('\n')
    .map(s => s.trim())
    .filter(x => x !== '')
}

export async function createOrUpdateBranch(
  git: GitCommandManager,
  commitMessage: string,
  base: string,
  branch: string,
  branchRemoteName: string,
  signoff: boolean
): Promise<CreateOrUpdateBranchResult> {
  // Get the working base. This may or may not be the actual base.
  const workingBase = await git.symbolicRef('HEAD', ['--short'])
  // If the base is not specified it is assumed to be the working base.
  base = base ? base : workingBase
  const baseRemote = 'origin'

  // Set the default return values
  const result: CreateOrUpdateBranchResult = {
    action: 'none',
    base: base,
    hasDiffWithBase: false
  }

  // Save the working base changes to a temporary branch
  const tempBranch = uuidv4()
  await git.checkout(tempBranch, 'HEAD')
  // Commit any uncommitted changes
  if (await git.isDirty(true)) {
    core.info('Uncommitted changes found. Adding a commit.')
    await git.exec(['add', '-A'])
    const params = ['-m', commitMessage]
    if (signoff) {
      params.push('--signoff')
    }
    await git.commit(params)
  }

  // Perform fetch and reset the working base
  // Commits made during the workflow will be removed
  await git.fetch([`${workingBase}:${workingBase}`], baseRemote, ['--force'])

  // If the working base is not the base, rebase the temp branch commits
  if (workingBase != base) {
    core.info(
      `Rebasing commits made to branch '${workingBase}' on to base branch '${base}'`
    )
    // Checkout the actual base
    await git.fetch([`${base}:${base}`], baseRemote, ['--force'])
    await git.checkout(base)
    // Cherrypick commits from the temporary branch starting from the working base
    const commits = await git.revList(
      [`${workingBase}..${tempBranch}`, '.'],
      ['--reverse']
    )
    for (const commit of splitLines(commits)) {
      const result = await git.cherryPick(
        ['--strategy=recursive', '--strategy-option=theirs', commit],
        true
      )
      if (result.exitCode != 0 && !result.stderr.includes(CHERRYPICK_EMPTY)) {
        throw new Error(`Unexpected error: ${result.stderr}`)
      }
    }
    // Reset the temp branch to the working index
    await git.checkout(tempBranch, 'HEAD')
    // Reset the base
    await git.fetch([`${base}:${base}`], baseRemote, ['--force'])
  }

  // Try to fetch the pull request branch
  if (!(await tryFetch(git, branchRemoteName, branch))) {
    // The pull request branch does not exist
    core.info(`Pull request branch '${branch}' does not exist yet.`)
    // Create the pull request branch
    await git.checkout(branch, 'HEAD')
    // Check if the pull request branch is ahead of the base
    result.hasDiffWithBase = await isAhead(git, base, branch)
    if (result.hasDiffWithBase) {
      result.action = 'created'
      core.info(`Created branch '${branch}'`)
    } else {
      core.info(
        `Branch '${branch}' is not ahead of base '${base}' and will not be created`
      )
    }
  } else {
    // The pull request branch exists
    core.info(
      `Pull request branch '${branch}' already exists as remote branch '${branchRemoteName}/${branch}'`
    )
    // Checkout the pull request branch
    await git.checkout(branch)

    if (await hasDiff(git, branch, tempBranch)) {
      // If the branch differs from the recreated temp version then the branch is reset
      // For changes on base this action is similar to a rebase of the pull request branch
      core.info(`Resetting '${branch}'`)
      // Alternatively, git switch -C branch tempBranch
      await git.checkout(branch, tempBranch)
    }

    // Check if the pull request branch has been updated
    // If the branch was reset or updated it will be ahead
    // It may be behind if a reset now results in no diff with the base
    if (!(await isEven(git, `${branchRemoteName}/${branch}`, branch))) {
      result.action = 'updated'
      core.info(`Updated branch '${branch}'`)
    } else {
      result.action = 'not-updated'
      core.info(
        `Branch '${branch}' is even with its remote and will not be updated`
      )
    }

    // Check if the pull request branch is ahead of the base
    result.hasDiffWithBase = await isAhead(git, base, branch)
  }

  // Delete the temporary branch
  await git.exec(['branch', '--delete', '--force', tempBranch])

  return result
}

interface CreateOrUpdateBranchResult {
  action: string
  base: string
  hasDiffWithBase: boolean
}
