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
    expect(initialCommit.changes[0].mode).toEqual('100644')
    expect(initialCommit.changes[0].status).toEqual('A')
    expect(initialCommit.changes[0].path).toEqual('README_TEMP.md')

    expect(emptyCommit.subject).toEqual('empty commit for tests')
    expect(emptyCommit.tree).toEqual(initialCommit.tree) // empty commits have no tree and reference the parent's
    expect(emptyCommit.parents[0]).toEqual(initialCommit.sha)
    expect(emptyCommit.signed).toBeFalsy()
    expect(emptyCommit.changes).toEqual([])

    expect(modifiedCommit.subject).toEqual('add sparkles')
    expect(modifiedCommit.parents[0]).toEqual(emptyCommit.sha)
    expect(modifiedCommit.signed).toBeFalsy()
    expect(modifiedCommit.changes[0].mode).toEqual('100644')
    expect(modifiedCommit.changes[0].status).toEqual('M')
    expect(modifiedCommit.changes[0].path).toEqual('README_TEMP.md')

    expect(headCommit.subject).toEqual('rename readme')
    expect(headCommit.parents[0]).toEqual(modifiedCommit.sha)
    expect(headCommit.signed).toBeFalsy()
    expect(headCommit.changes[0].mode).toEqual('100644')
    expect(headCommit.changes[0].status).toEqual('A')
    expect(headCommit.changes[0].path).toEqual('README.md')
    expect(headCommit.changes[1].mode).toEqual('100644')
    expect(headCommit.changes[1].status).toEqual('D')
    expect(headCommit.changes[1].path).toEqual('README_TEMP.md')
  })
})
