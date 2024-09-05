import * as core from '@actions/core'
import {GitCommandManager, Commit} from './git-command-manager'
import {v4 as uuidv4} from 'uuid'
import * as utils from './utils'

const CHERRYPICK_EMPTY =
  'The previous cherry-pick is now empty, possibly due to conflict resolution.'
const NOTHING_TO_COMMIT = 'nothing to commit, working tree clean'

const FETCH_DEPTH_MARGIN = 10

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
  branch: string,
  depth: number
): Promise<boolean> {
  try {
    await git.fetch([`${branch}:refs/remotes/${remote}/${branch}`], remote, [
      '--force',
      `--depth=${depth}`
    ])
    return true
  } catch {
    return false
  }
}

export async function buildBranchCommits(
  git: GitCommandManager,
  base: string,
  branch: string
): Promise<Commit[]> {
  const output = await git.exec(['log', '--format=%H', `${base}..${branch}`])
  const shas = output.stdout
    .split('\n')
    .filter(x => x !== '')
    .reverse()
  const commits: Commit[] = []
  for (const sha of shas) {
    const commit = await git.getCommit(sha)
    commits.push(commit)
    for (const unparsedChange of commit.unparsedChanges) {
      core.warning(`Skipping unexpected diff entry: ${unparsedChange}`)
    }
  }
  return commits
}

// Return the number of commits that branch2 is ahead of branch1
async function commitsAhead(
  git: GitCommandManager,
  branch1: string,
  branch2: string
): Promise<number> {
  const result = await git.revList(
    [`${branch1}...${branch2}`],
    ['--right-only', '--count']
  )
  return Number(result)
}

// Return true if branch2 is ahead of branch1
async function isAhead(
  git: GitCommandManager,
  branch1: string,
  branch2: string
): Promise<boolean> {
  return (await commitsAhead(git, branch1, branch2)) > 0
}

// Return the number of commits that branch2 is behind branch1
async function commitsBehind(
  git: GitCommandManager,
  branch1: string,
  branch2: string
): Promise<number> {
  const result = await git.revList(
    [`${branch1}...${branch2}`],
    ['--left-only', '--count']
  )
  return Number(result)
}

// Return true if branch2 is behind branch1
async function isBehind(
  git: GitCommandManager,
  branch1: string,
  branch2: string
): Promise<boolean> {
  return (await commitsBehind(git, branch1, branch2)) > 0
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

// Return true if the specified number of commits on branch1 and branch2 have a diff
async function commitsHaveDiff(
  git: GitCommandManager,
  branch1: string,
  branch2: string,
  depth: number
): Promise<boolean> {
  // Some action use cases lead to the depth being a very large number and the diff fails.
  // I've made this check optional for now because it was a fix for an edge case that is
  // very rare, anyway.
  try {
    const diff1 = (
      await git.exec(['diff', '--stat', `${branch1}..${branch1}~${depth}`])
    ).stdout.trim()
    const diff2 = (
      await git.exec(['diff', '--stat', `${branch2}..${branch2}~${depth}`])
    ).stdout.trim()
    return diff1 !== diff2
  } catch (error) {
    core.info('Failed optional check of commits diff; Skipping.')
    core.debug(utils.getErrorMessage(error))
    return false
  }
}

function splitLines(multilineString: string): string[] {
  return multilineString
    .split('\n')
    .map(s => s.trim())
    .filter(x => x !== '')
}

interface CreateOrUpdateBranchResult {
  action: string
  base: string
  hasDiffWithBase: boolean
  baseCommit: Commit
  headSha: string
  branchCommits: Commit[]
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

  // Save the working base changes to a temporary branch
  const tempBranch = uuidv4()
  await git.checkout(tempBranch, 'HEAD')
  // Commit any uncommitted changes
  if (await git.isDirty(true, addPaths)) {
    core.info('Uncommitted changes found. Adding a commit.')
    const aopts = ['add']
    if (addPaths.length > 0) {
      aopts.push(...['--', ...addPaths])
    } else {
      aopts.push('-A')
    }
    await git.exec(aopts, true)
    const popts = ['-m', commitMessage]
    if (signoff) {
      popts.push('--signoff')
    }
    const commitResult = await git.commit(popts, true)
    // 'nothing to commit' can occur when core.autocrlf is set to true
    if (
      commitResult.exitCode != 0 &&
      !commitResult.stdout.includes(NOTHING_TO_COMMIT)
    ) {
      throw new Error(`Unexpected error: ${commitResult.stderr}`)
    }
  }

  // Stash any uncommitted tracked and untracked changes
  const stashed = await git.stashPush(['--include-untracked'])

  // Reset the working base
  // Commits made during the workflow will be removed
  if (workingBaseType == WorkingBaseType.Branch) {
    core.info(`Resetting working base branch '${workingBase}'`)
    await git.checkout(workingBase)
    await git.exec(['reset', '--hard', `${baseRemote}/${workingBase}`])
  }

  // If the working base is not the base, rebase the temp branch commits
  // This will also be true if the working base type is a commit
  if (workingBase != base) {
    core.info(
      `Rebasing commits made to ${workingBaseType} '${workingBase}' on to base branch '${base}'`
    )
    const fetchArgs = ['--force']
    if (branchRemoteName != 'fork') {
      // If pushing to a fork we cannot shallow fetch otherwise the 'shallow update not allowed' error occurs
      fetchArgs.push('--depth=1')
    }
    // Checkout the actual base
    await git.fetch([`${base}:${base}`], baseRemote, fetchArgs)
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
    await git.fetch([`${base}:${base}`], baseRemote, fetchArgs)
  }

  // Determine the fetch depth for the pull request branch (best effort)
  const tempBranchCommitsAhead = await commitsAhead(git, base, tempBranch)
  const fetchDepth =
    tempBranchCommitsAhead > 0
      ? tempBranchCommitsAhead + FETCH_DEPTH_MARGIN
      : FETCH_DEPTH_MARGIN

  let action = 'none'
  let hasDiffWithBase = false

  // Try to fetch the pull request branch
  if (!(await tryFetch(git, branchRemoteName, branch, fetchDepth))) {
    // The pull request branch does not exist
    core.info(`Pull request branch '${branch}' does not exist yet.`)
    // Create the pull request branch
    await git.checkout(branch, tempBranch)
    // Check if the pull request branch is ahead of the base
    hasDiffWithBase = await isAhead(git, base, branch)
    if (hasDiffWithBase) {
      action = 'created'
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
    // - If the number of commits ahead of the base branch differs between the branch and
    //   temp branch. This catches a case where the base branch has been force pushed to
    //   a new commit.
    // - If the recreated temp branch is not ahead of the base. This means there will be
    //   no pull request diff after the branch is reset. This will reset any undeleted
    //   branches after merging. In particular, it catches a case where the branch was
    //   squash merged but not deleted. We need to reset to make sure it doesn't appear
    //   to have a diff with the base due to different commits for the same changes.
    // - If the diff of the commits ahead of the base branch differs between the branch and
    //   temp branch. This catches a case where changes have been partially merged to the
    //   base. The overall diff is the same, but the branch needs to be rebased to show
    //   the correct diff.
    //
    // For changes on base this reset is equivalent to a rebase of the pull request branch.
    const branchCommitsAhead = await commitsAhead(git, base, branch)
    if (
      (await git.hasDiff([`${branch}..${tempBranch}`])) ||
      branchCommitsAhead != tempBranchCommitsAhead ||
      !(tempBranchCommitsAhead > 0) || // !isAhead
      (await commitsHaveDiff(git, branch, tempBranch, tempBranchCommitsAhead))
    ) {
      core.info(`Resetting '${branch}'`)
      // Alternatively, git switch -C branch tempBranch
      await git.checkout(branch, tempBranch)
    }

    // Check if the pull request branch has been updated
    // If the branch was reset or updated it will be ahead
    // It may be behind if a reset now results in no diff with the base
    if (!(await isEven(git, `${branchRemoteName}/${branch}`, branch))) {
      action = 'updated'
      core.info(`Updated branch '${branch}'`)
    } else {
      action = 'not-updated'
      core.info(
        `Branch '${branch}' is even with its remote and will not be updated`
      )
    }

    // Check if the pull request branch is ahead of the base
    hasDiffWithBase = await isAhead(git, base, branch)
  }

  // Get the base and head SHAs
  const baseSha = await git.revParse(base)
  const baseCommit = await git.getCommit(baseSha)
  const headSha = await git.revParse(branch)

  let branchCommits: Commit[] = []
  if (hasDiffWithBase) {
    // Build the branch commits
    branchCommits = await buildBranchCommits(git, base, branch)
  }

  // Delete the temporary branch
  await git.exec(['branch', '--delete', '--force', tempBranch])

  // Checkout the working base to leave the local repository as it was found
  await git.checkout(workingBase)

  // Restore any stashed changes
  if (stashed) {
    await git.stashPop()
  }

  return {
    action: action,
    base: base,
    hasDiffWithBase: hasDiffWithBase,
    baseCommit: baseCommit,
    headSha: headSha,
    branchCommits: branchCommits
  }
}
