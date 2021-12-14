import * as core from '@actions/core'
import {GitCommandManager} from './git-command-manager'
import {v4 as uuidv4} from 'uuid'

const CHERRYPICK_EMPTY =
  'The previous cherry-pick is now empty, possibly due to conflict resolution.'

export enum WorkingBaseType {
  Branch = 'branch',
  Commit = 'commit'
}

export async function getWorkingBaseAndType(
  git: GitCommandManager
): Promise<[string, WorkingBaseType]> {
  const symbolicRefResult = await git.exec(
    ['symbolic-ref', 'HEAD', '--short'],
    true
  )
  if (symbolicRefResult.exitCode == 0) {
    // A ref is checked out
    return [symbolicRefResult.stdout.trim(), WorkingBaseType.Branch]
  } else {
    // A commit is checked out (detached HEAD)
    const headSha = await git.revParse('HEAD')
    return [headSha, WorkingBaseType.Commit]
  }
}

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
  signoff: boolean,
  addPaths: string[]
): Promise<CreateOrUpdateBranchResult> {
  // Get the working base.
  // When a ref, it may or may not be the actual base.
  // When a commit, we must rebase onto the actual base.
  const [workingBase, workingBaseType] = await getWorkingBaseAndType(git)
  core.info(`Working base is ${workingBaseType} '${workingBase}'`)
  if (workingBaseType == WorkingBaseType.Commit && !base) {
    throw new Error(`When in 'detached HEAD' state, 'base' must be supplied.`)
  }

  // If the base is not specified it is assumed to be the working base.
  base = base ? base : workingBase
  const baseRemote = 'origin'

  // Set the default return values
  const result: CreateOrUpdateBranchResult = {
    action: 'none',
    base: base,
    hasDiffWithBase: false,
    headSha: ''
  }

  // Save the working base changes to a temporary branch
  const tempBranch = uuidv4()
  await git.checkout(tempBranch, 'HEAD')
  // Commit any uncommitted changes
  if (await git.isDirty(true)) {
    core.info('Uncommitted changes found. Adding a commit.')
    for (const path of addPaths) {
      await git.exec(['add', path], true)
    }
    const params = ['-m', commitMessage]
    if (signoff) {
      params.push('--signoff')
    }
    await git.commit(params)
    // Remove uncommitted tracked and untracked changes
    await git.exec(['reset', '--hard'])
    await git.exec(['clean', '-f'])
  }

  // Perform fetch and reset the working base
  // Commits made during the workflow will be removed
  if (workingBaseType == WorkingBaseType.Branch) {
    core.info(`Resetting working base branch '${workingBase}'`)
    if (branchRemoteName == 'fork') {
      // If pushing to a fork we must fetch with 'unshallow' to avoid the following error on git push
      // ! [remote rejected] HEAD -> tests/push-branch-to-fork (shallow update not allowed)
      await git.fetch([`${workingBase}:${workingBase}`], baseRemote, [
        '--force'
      ])
    } else {
      // If the remote is 'origin' we can git reset
      await git.checkout(workingBase)
      await git.exec(['reset', '--hard', `${baseRemote}/${workingBase}`])
    }
  }

  // If the working base is not the base, rebase the temp branch commits
  // This will also be true if the working base type is a commit
  if (workingBase != base) {
    core.info(
      `Rebasing commits made to ${workingBaseType} '${workingBase}' on to base branch '${base}'`
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
    await git.checkout(branch, tempBranch)
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

    // Reset the branch if one of the following conditions is true.
    // - If the branch differs from the recreated temp branch.
    // - If the recreated temp branch is not ahead of the base. This means there will be
    //   no pull request diff after the branch is reset. This will reset any undeleted
    //   branches after merging. In particular, it catches a case where the branch was
    //   squash merged but not deleted. We need to reset to make sure it doesn't appear
    //   to have a diff with the base due to different commits for the same changes.
    // For changes on base this reset is equivalent to a rebase of the pull request branch.
    if (
      (await git.hasDiff([`${branch}..${tempBranch}`])) ||
      !(await isAhead(git, base, tempBranch))
    ) {
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

  // Get the pull request branch SHA
  result.headSha = await git.revParse('HEAD')

  // Delete the temporary branch
  await git.exec(['branch', '--delete', '--force', tempBranch])

  return result
}

interface CreateOrUpdateBranchResult {
  action: string
  base: string
  hasDiffWithBase: boolean
  headSha: string
}
