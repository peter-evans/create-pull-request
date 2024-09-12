import {GitCommandManager} from '../lib/git-command-manager'

const REPO_PATH = '/git/local/repos/test-base'

describe('git-command-manager integration tests', () => {
  let git: GitCommandManager

  beforeAll(async () => {
    git = await GitCommandManager.create(REPO_PATH)
    await git.checkout('main')
  })

  it('tests getCommit', async () => {
    const initialCommit = await git.getCommit('HEAD^^^')
    const emptyCommit = await git.getCommit('HEAD^^')
    const modifiedCommit = await git.getCommit('HEAD^')
    const headCommit = await git.getCommit('HEAD')

    expect(initialCommit.subject).toEqual('initial commit')
    expect(initialCommit.signed).toBeFalsy()
    expect(initialCommit.changes).toEqual([
      {mode: '100644', status: 'A', path: 'README_TEMP.md'}
    ])

    expect(emptyCommit.subject).toEqual('empty commit for tests')
    expect(emptyCommit.tree).toEqual(initialCommit.tree) // empty commits have no tree and reference the parent's
    expect(emptyCommit.parents[0]).toEqual(initialCommit.sha)
    expect(emptyCommit.signed).toBeFalsy()
    expect(emptyCommit.changes).toEqual([])

    expect(modifiedCommit.subject).toEqual('add sparkles')
    expect(modifiedCommit.parents[0]).toEqual(emptyCommit.sha)
    expect(modifiedCommit.signed).toBeFalsy()
    expect(modifiedCommit.changes).toEqual([
      {mode: '100644', status: 'M', path: 'README_TEMP.md'}
    ])

    expect(headCommit.subject).toEqual('rename readme')
    expect(headCommit.parents[0]).toEqual(modifiedCommit.sha)
    expect(headCommit.signed).toBeFalsy()
    expect(headCommit.changes).toEqual([
      {mode: '100644', status: 'A', path: 'README.md'},
      {mode: '100644', status: 'D', path: 'README_TEMP.md'}
    ])    
  })
})
