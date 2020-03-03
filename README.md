# <img width="24" height="24" src="docs/assets/logo.svg"> Create Pull Request
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Create%20Pull%20Request-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4O3EEtbPwhJbr6Te28CmdSKeqzeqr0YbfVIrTBKakvtOl5dtTkK+v4HfA9PEyBFCY9AGVgCBLaBp1jPAyfAJ/AAdIEG0dNAiyP7+K1qIfMdonZic6+WJoBJvQlvuwDqcXadUuqPA1NKAlexbRTAIMvMOCjTbMwl1LtI/6KWJ5Q6rT6Ht1MA58AX8Apcqqt5r2qhrgAXQC3CZ6i1+KMd9TRu3MvA3aH/fFPnBodb6oe6HM8+lYHrGdRXW8M9bMZtPXUji69lmf5Cmamq7quNLFZXD9Rq7v0Bpc1o/tp0fisAAAAASUVORK5CYII=)](https://github.com/marketplace/actions/create-pull-request)

A GitHub action to create a pull request for changes to your repository in the actions workspace.

Changes to a repository in the Actions workspace persist between steps in a workflow.
This action is designed to be used in conjunction with other steps that modify or add files to your repository.
The changes will be automatically committed to a new branch and a pull request created.

Create Pull Request action will:

1. Check for repository changes in the Actions workspace. This includes:
   - untracked (new) files
   - tracked (modified) files
   - commits made during the workflow that have not been pushed
2. Commit all changes to a new branch, or update an existing pull request branch.
3. Create a pull request to merge the new branch into the base&mdash;the branch checked out in the workflow.

## Documentation

- [Concepts, guidelines and advanced usage](docs/concepts-guidelines.md)
- [Examples](docs/examples.md)
- [Updating from v1](docs/updating.md)

## Usage

```yml
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

You can also pin to a [specific release](https://github.com/peter-evans/create-pull-request/releases) version in the format `@v2.x.x`

### Action inputs

With the exception of `token`, all inputs are **optional**. If not set, sensible default values will be used.

**Note**: If you want pull requests created by this action to trigger an `on: push` or `on: pull_request` workflow then you must use a [Personal Access Token](https://help.github.com/en/articles/creating-a-personal-access-token-for-the-command-line) instead of the default `GITHUB_TOKEN`. Alternatively, allow the action to [push using SSH](https://github.com/peter-evans/create-pull-request/blob/master/docs/concepts-guidelines.md#push-using-ssh-deploy-keys) by configuring a deploy key.

| Name | Description | Default |
| --- | --- | --- |
| `token` | `GITHUB_TOKEN` or a `repo` scoped [PAT](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line). | |
| `path` | Relative path under `$GITHUB_WORKSPACE` to the repository. | `$GITHUB_WORKSPACE` |
| `commit-message` | The message to use when committing changes. | `[create-pull-request] automated change` |
| `committer` | The committer name and email address in the format `Display Name <email@address.com>`. | Defaults to the GitHub Actions bot user. See [Committer and author](#committer-and-author) for details. |
| `author` | The author name and email address in the format `Display Name <email@address.com>`. | Defaults to the GitHub Actions bot user. See [Committer and author](#committer-and-author) for details. |
| `title` | The title of the pull request. | `Changes by create-pull-request action` |
| `body` | The body of the pull request. | `Automated changes by [create-pull-request](https://github.com/peter-evans/create-pull-request) GitHub action` |
| `labels` | A comma separated list of labels. | |
| `assignees` | A comma separated list of assignees (GitHub usernames). | |
| `reviewers` | A comma separated list of reviewers (GitHub usernames) to request a review from. | |
| `team-reviewers` | A comma separated list of GitHub teams to request a review from. | |
| `milestone` | The number of the milestone to associate this pull request with. | |
| `project` | The name of the project for which a card should be created. Requires `project-column`. | |
| `project-column` | The name of the project column under which a card should be created. Requires `project`. | |
| `branch` | The branch name. See [Branch naming](#branch-naming) for details. | `create-pull-request/patch` |
| `base` | Sets the pull request base branch. | Defaults to the branch checked out in the workflow. |
| `branch-suffix` | The branch suffix type. Valid values are `random`, `timestamp` and `short-commit-hash`. See [Branch naming](#branch-naming) for details. | |

**Outputs**

The pull request number is output as both an environment variable and a step output.
Note that in order to read the step output the action step must have an id.

```yml
      - name: Create Pull Request
        id: cpr
        uses: peter-evans/create-pull-request@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      - name: Check outputs
        run: |
          echo "Pull Request Number - ${{ env.PULL_REQUEST_NUMBER }}"
          echo "Pull Request Number - ${{ steps.cpr.outputs.pr_number }}"
```

### Checkout

This action expects repositories to be checked out with `actions/checkout@v2`.

If there is some reason you need to use `actions/checkout@v1` the following step can be added to checkout the branch.

```yml
      - uses: actions/checkout@v1
      - run: git checkout "${GITHUB_REF:11}"
```

### Branch naming

For branch naming there are two strategies. Create a fixed-name pull request branch that will be updated with new changes until it is merged or closed, OR, always create a new unique branch each time there are changes to be committed.

#### Strategy A - Create and update a pull request branch (default)

This strategy is the default behaviour of the action. The input `branch` defaults to `create-pull-request/patch`. Changes will be committed to this branch and a pull request created. Any subsequent changes will be committed to the *same* branch and reflected in the open pull request. If the pull request is merged or closed a new one will be created. If subsequent changes cause the branch to no longer differ from the base the pull request will be automatically closed and the branch deleted.

#### Strategy B - Always create a new pull request branch

For this strategy there are three options to suffix the branch name.
The branch name is defined by the input `branch` and defaults to `create-pull-request/patch`. The following options are values for `branch-suffix`.

- `random` - Commits will be made to a branch suffixed with a random alpha-numeric string. This option should be used if multiple pull requests will be created during the execution of a workflow. e.g. `create-pull-request/patch-6qj97jr`, `create-pull-request/patch-5jrjhvd`

- `timestamp` - Commits will be made to a branch suffixed by a timestamp. e.g. `create-pull-request/patch-1569322532`, `create-pull-request/patch-1569322552`

- `short-commit-hash` - Commits will be made to a branch suffixed with the short SHA1 commit hash. e.g. `create-pull-request/patch-fcdfb59`, `create-pull-request/patch-394710b`

### Ignoring files

If there are files or directories you want to ignore you can simply add them to a `.gitignore` file at the root of your repository. The action will respect this file.

### Committer and author

If neither `committer` or `author` inputs are supplied the action will default to making commits that appear to be made by the GitHub Actions bot user.

In most cases, where the committer and author are the same, just the committer can be set.
```yml
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          committer: Peter Evans <peter-evans@users.noreply.github.com>
```

### Controlling commits

As well as relying on the action to handle uncommitted changes, you can additionally make your own commits before the action runs.

```yml
    steps:
      - uses: actions/checkout@v2
      - name: Create commits
        run: |
          git config user.name 'Peter Evans'
          git config user.email 'peter-evans@users.noreply.github.com'
          date +%s > report.txt
          git commit -am "Modify tracked file during workflow"
          date +%s > new-report.txt
          git add -A
          git commit -m "Add untracked file during workflow"
      - name: Uncommitted change
        run: date +%s > report.txt
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Reference Example

The following workflow is a reference example that sets all the main inputs.

See [examples](docs/examples.md) for more realistic use cases.

```yml
name: Create Pull Request
on: push
jobs:
  createPullRequest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Create report file
        run: date +%s > report.txt
      - name: Create Pull Request
        id: cpr
        uses: peter-evans/create-pull-request@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: Add report file
          committer: Peter Evans <peter-evans@users.noreply.github.com>
          author: Peter Evans <peter-evans@users.noreply.github.com>
          title: '[Example] Add report file'
          body: |
            New report
            - Contains *today's* date
            - Auto-generated by [create-pull-request][1]

            [1]: https://github.com/peter-evans/create-pull-request
          labels: report, automated pr
          assignees: peter-evans
          reviewers: peter-evans
          team-reviewers: owners, maintainers
          milestone: 1
          project: Example Project
          project-column: To do
          branch: example-patches
      - name: Check outputs
        run: |
          echo "Pull Request Number - ${{ env.PULL_REQUEST_NUMBER }}"
          echo "Pull Request Number - ${{ steps.cpr.outputs.pr_number }}"
```

This reference configuration will create pull requests that look like this:

![Pull Request Example](docs/assets/pull-request-example.png)

## License

[MIT](LICENSE)
