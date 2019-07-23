# Create Pull Request
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Create%20Pull%20Request-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4O3EEtbPwhJbr6Te28CmdSKeqzeqr0YbfVIrTBKakvtOl5dtTkK+v4HfA9PEyBFCY9AGVgCBLaBp1jPAyfAJ/AAdIEG0dNAiyP7+K1qIfMdonZic6+WJoBJvQlvuwDqcXadUuqPA1NKAlexbRTAIMvMOCjTbMwl1LtI/6KWJ5Q6rT6Ht1MA58AX8Apcqqt5r2qhrgAXQC3CZ6i1+KMd9TRu3MvA3aH/fFPnBodb6oe6HM8+lYHrGdRXW8M9bMZtPXUji69lmf5Cmamq7quNLFZXD9Rq7v0Bpc1o/tp0fisAAAAASUVORK5CYII=)](https://github.com/marketplace/actions/create-pull-request)

A GitHub action to create a pull request for changes to your repository in the actions workspace.

Changes to a repository in the actions workspace persist between actions in a workflow.
This action is designed to be used in conjunction with other actions that modify or add files to your repository.
The changes will be automatically committed to a new branch and a pull request created.

Create Pull Request action will:

1. Check for repository changes in the actions workspace. This includes untracked (new) files as well as modified files.
2. Commit all changes to a new branch. The commit will be made using the name and email of the `HEAD` commit author.
3. Create a pull request to merge the new branch into the currently active branch executing the workflow.

## Usage

```hcl
action "Create Pull Request" {
  uses = "peter-evans/create-pull-request@v1.0.0"
  secrets = ["GITHUB_TOKEN"]
}
```

#### Environment variables

These variables are all optional. If not set, a default value will be used.

- `PULL_REQUEST_BRANCH` - The branch name. See **Branch naming** below for details.
- `COMMIT_MESSAGE` - The message to use when committing changes.
- `PULL_REQUEST_TITLE` - The title of the pull request.
- `PULL_REQUEST_BODY` - The body of the pull request.

#### Branch naming

The variable `PULL_REQUEST_BRANCH` defaults to `create-pull-request/patch`.
Commits will be made to a branch with this name and suffixed with the short SHA1 commit hash.

e.g.
```
create-pull-request/patch-fcdfb59
create-pull-request/patch-394710b
```

#### Ignoring files

If there are files or directories you want to ignore you can simply add them to a `.gitignore` file at the root of your repository. The action will respect this file.

## Example

Here is an example that sets all the environment variables.

```hcl
action "Create Pull Request" {
  uses = "peter-evans/create-pull-request@v1.0.0"
  secrets = ["GITHUB_TOKEN"]
  env = {
    PULL_REQUEST_BRANCH = "my-patches"
    COMMIT_MESSAGE = "Auto-modify files by my-file-modifier-action"
    PULL_REQUEST_TITLE = "Changes from my-file-modifier-action"
    PULL_REQUEST_BODY = "This is an auto-generated PR with changes from my-file-modifier-action"
  }
}
```

This configuration will create pull requests that look like this:

![Pull Request Example](pull-request-example.png?raw=true)

## License

MIT License - see the [LICENSE](LICENSE) file for details
