import {GitCommandManager, Commit} from '../lib/git-command-manager'

const REPO_PATH = '/git/local/repos/test-base'

describe('git-command-manager integration tests', () => {
  let git: GitCommandManager

  beforeAll(async () => {
    git = await GitCommandManager.create(REPO_PATH)
    await git.checkout('main')
  })

  it('tests getCommit', async () => {
    const parent = await git.getCommit('HEAD^')
    const commit = await git.getCommit('HEAD')
    expect(parent.subject).toEqual('initial commit')
    expect(parent.changes).toEqual([{"mode": "100644", "status": "A", "path": "README.md"}])
    expect(commit.subject).toEqual('add sparkles')
    expect(commit.parents[0]).toEqual(parent.sha)
    expect(commit.changes).toEqual([{"mode": "100644", "status": "M", "path": "README.md"}])
  })
})
