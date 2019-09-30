# Create Pull Request
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Create%20Pull%20Request-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4O3EEtbPwhJbr6Te28CmdSKeqzeqr0YbfVIrTBKakvtOl5dtTkK+v4HfA9PEyBFCY9AGVgCBLaBp1jPAyfAJ/AAdIEG0dNAiyP7+K1qIfMdonZic6+WJoBJvQlvuwDqcXadUuqPA1NKAlexbRTAIMvMOCjTbMwl1LtI/6KWJ5Q6rT6Ht1MA58AX8Apcqqt5r2qhrgAXQC3CZ6i1+KMd9TRu3MvA3aH/fFPnBodb6oe6HM8+lYHrGdRXW8M9bMZtPXUji69lmf5Cmamq7quNLFZXD9Rq7v0Bpc1o/tp0fisAAAAASUVORK5CYII=)](https://github.com/marketplace/actions/create-pull-request)

A GitHub action to create a pull request for changes to your repository in the actions workspace.

Changes to a repository in the Actions workspace persist between steps in a workflow.
This action is designed to be used in conjunction with other steps that modify or add files to your repository.
The changes will be automatically committed to a new branch and a pull request created.

Create Pull Request action will:

1. Check for repository changes in the Actions workspace. This includes untracked (new) files as well as modified files.
2. Commit all changes to a new branch, or update an existing pull request branch. The commit will be made using the name and email of the `HEAD` commit author.
3. Create a pull request to merge the new branch into the currently active branch executing the workflow.

## Usage

Linux
```yml
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v1.4.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Multi platform - Linux, MacOS, Windows (beta)
```yml
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v1.4.0-multi
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Environment variables

These variables are all optional. If not set, a default value will be used.

- `COMMIT_MESSAGE` - The message to use when committing changes.
- `PULL_REQUEST_TITLE` - The title of the pull request.
- `PULL_REQUEST_BODY` - The body of the pull request.
- `PULL_REQUEST_LABELS` - A comma separated list of labels.
- `PULL_REQUEST_ASSIGNEES` - A comma separated list of assignees (GitHub usernames).
- `PULL_REQUEST_REVIEWERS` - A comma separated list of reviewers (GitHub usernames) to request a review from.
- `PULL_REQUEST_TEAM_REVIEWERS` - A comma separated list of GitHub teams to request a review from.
- `PULL_REQUEST_MILESTONE` - The number of the milestone to associate this pull request with.
- `PULL_REQUEST_BRANCH` - The branch name. See **Branch naming** below for details.
- `BRANCH_SUFFIX` - The branch suffix type. Valid values are `short-commit-hash` (default), `timestamp`, `random` and `none`. See **Branch naming** below for details.

Output environment variables

- `PULL_REQUEST_NUMBER` - The number of the pull request created.

The following parameters are available for debugging and troubleshooting.

- `DEBUG_EVENT` - If present, outputs the event data that triggered the workflow.
- `SKIP_IGNORE` - If present, the `ignore_event` function will be skipped.

### Branch naming

For branch naming there are two strategies. Always create a new branch each time there are changes to be committed, OR, create a fixed-name pull request branch that will be updated with any new commits until it is merged or closed.

#### Strategy A - Always create a new pull request branch (default)

For this strategy there are three options to suffix the branch name.
The branch name is defined by the variable `PULL_REQUEST_BRANCH` and defaults to `create-pull-request/patch`. The following options are values for `BRANCH_SUFFIX`.

- `short-commit-hash` (default) - Commits will be made to a branch suffixed with the short SHA1 commit hash. e.g. `create-pull-request/patch-fcdfb59`, `create-pull-request/patch-394710b`

- `timestamp` - Commits will be made to a branch suffixed by a timestamp. e.g. `create-pull-request/patch-1569322532`, `create-pull-request/patch-1569322552`

- `random` - Commits will be made to a branch suffixed with a random alpha-numeric string. This option should be used if multiple pull requests will be created during the execution of a workflow. e.g. `create-pull-request/patch-6qj97jr`, `create-pull-request/patch-5jrjhvd`

#### Strategy B - Create and update a pull request branch

To use this strategy, set `BRANCH_SUFFIX` to the value `none`. The variable `PULL_REQUEST_BRANCH` defaults to `create-pull-request/patch`. Commits will be made to this branch and a pull request created. Any subsequent changes will be committed to the *same* branch and reflected in the existing pull request.

### Ignoring files

If there are files or directories you want to ignore you can simply add them to a `.gitignore` file at the root of your repository. The action will respect this file.

## Example

Here is an example that sets all the main environment variables.

```yml
on:
  repository_dispatch:
    types: [create-pull-request]
name: create-pull-request workflow
jobs:
  createPullRequest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      - name: Create report file
        run: date +%s > report.txt
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v1.4.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COMMIT_MESSAGE: Add report file
          PULL_REQUEST_BODY: >
            This PR is auto-generated by 
            [create-pull-request](https://github.com/peter-evans/create-pull-request).
          PULL_REQUEST_TITLE: '[Example] Add report file'
          PULL_REQUEST_LABELS: report, automated pr
          PULL_REQUEST_ASSIGNEES: peter-evans
          PULL_REQUEST_REVIEWERS: peter-evans
          PULL_REQUEST_MILESTONE: 1
          PULL_REQUEST_BRANCH: example-patches
          BRANCH_SUFFIX: short-commit-hash
      - name: Check output environment variable
        run: echo "Pull Request Number - $PULL_REQUEST_NUMBER"
```

This configuration will create pull requests that look like this:

![Pull Request Example](pull-request-example.png?raw=true)

## License

[MIT](LICENSE)
