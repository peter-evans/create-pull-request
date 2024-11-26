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
  wasRebased: boolean
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

  let action = 'none'
  let hasDiffWithBase = false
  const baseRemote = 'origin'

  if (workingBase != branch) {
    if (!(await tryFetch(git, branchRemoteName, branch, 0))) {
      // The pull request branch does not exist
      core.info(`Pull request branch '${branch}' does not exist yet.`)
      // Create the pull request branch
      await git.checkout(branch, base)
      action = 'created'
      core.info(`Created branch '${branch}'`)
      // Check if the pull request branch is ahead of the base
    } else {
      // The pull request branch exists
      core.info(
        `Pull request branch '${branch}' already exists as remote branch '${branchRemoteName}/${branch}'`
      )
      // Checkout the pull request branch
      await git.checkout(branch)
    }
  }

  // Commit any changes
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

  // Check if the pull request branch is behind the base branch
  let wasRebased = false;
  await git.exec(['fetch', baseRemote, base])
  if (await isBehind(git, base, branch)) {
    // Rebase the current branch onto the base branch
    core.info(`Pull request branch '${branch}' is behind base branch '${base}'.`)
    await git.exec(['pull', '--rebase', baseRemote, base])
    core.info(`Rebased '${branch}' commits ontop of '${base}'.`)
    wasRebased = true;
  }

  hasDiffWithBase = await isAhead(git, base, branch)

  // If the base is not specified it is assumed to be the working base.
  base = base ? base : workingBase

  // Get the base and head SHAs
  const baseSha = await git.revParse(base)
  const baseCommit = await git.getCommit(baseSha)
  const headSha = await git.revParse(branch)

  let branchCommits: Commit[] = []
  if (hasDiffWithBase) {
    action = 'updated'
    // Build the branch commits
    branchCommits = await buildBranchCommits(git, base, branch)
  }

  return {
    action: action,
    base: base,
    hasDiffWithBase: hasDiffWithBase,
    wasRebased: wasRebased,
    baseCommit: baseCommit,
    headSha: headSha,
    branchCommits: branchCommits
  }
}
