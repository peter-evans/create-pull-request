## Updating from `v6` to `v7`

### Behaviour changes

- Action input `git-token` has been renamed `branch-token`, to be more clear about its purpose. The `branch-token` is the token that the action will use to create and update the branch.
- The action now handles requests that have been rate-limited by GitHub. Requests hitting a primary rate limit will retry twice, for a total of three attempts. Requests hitting a secondary rate limit will not be retried.
- The `pull-request-operation` output now returns `none` when no operation was executed.
- Removed deprecated output environment variable `PULL_REQUEST_NUMBER`. Please use the `pull-request-number` action output instead.

### What's new

- The action can now sign commits as `github-actions[bot]` when using `GITHUB_TOKEN`, or your own bot when using [GitHub App tokens](concepts-guidelines.md#authenticating-with-github-app-generated-tokens). See [commit signing](concepts-guidelines.md#commit-signature-verification-for-bots) for details.
- Action input `draft` now accepts a new value `always-true`. This will set the pull request to draft status when the pull request is updated, as well as on creation.
- A new action input `maintainer-can-modify` indicates whether [maintainers can modify](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/allowing-changes-to-a-pull-request-branch-created-from-a-fork) the pull request. The default is `true`, which retains the existing behaviour of the action.
- A new output `pull-request-commits-verified` returns `true` or `false`, indicating whether GitHub considers the signature of the branch's commits to be verified.

## Updating from `v5` to `v6`

### Behaviour changes

- The default values for `author` and `committer` have changed. See "What's new" below for details. If you are overriding the default values you will not be affected by this change.
- On completion, the action now removes the temporary git remote configuration it adds when using `push-to-fork`. This should not affect you unless you were using the temporary configuration for some other purpose after the action completes.

### What's new

- Updated runtime to Node.js 20
  - The action now requires a minimum version of [v2.308.0](https://github.com/actions/runner/releases/tag/v2.308.0) for the Actions runner. Update self-hosted runners to v2.308.0 or later to ensure compatibility.
- The default value for `author` has been changed to `${{ github.actor }} <${{ github.actor_id }}+${{ github.actor }}@users.noreply.github.com>`. The change adds the `${{ github.actor_id }}+` prefix to the email address to align with GitHub's standard format for the author email address.
- The default value for `committer` has been changed to `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`. This is to align with the default GitHub Actions bot user account.
- Adds input `git-token`, the [Personal Access Token (PAT)](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) that the action will use for git operations. This input defaults to the value of `token`. Use this input if you would like the action to use a different token for git operations than the one used for the GitHub API.
- `push-to-fork` now supports pushing to sibling repositories in the same network.
- Previously, when using `push-to-fork`, the action did not remove temporary git remote configuration it adds during execution. This has been fixed and the configuration is now removed when the action completes.
- If the pull request body is truncated due to exceeding the maximum length, the action will now suffix the body with the message "...*[Pull request body truncated]*" to indicate that the body has been truncated.
- The action now uses `--unshallow` only when necessary, rather than as a default argument of `git fetch`. This should improve performance, particularly for large git repositories with extensive commit history.
- The action can now be executed on one GitHub server and create pull requests on a *different* GitHub server. Server products include GitHub hosted (github.com), GitHub Enterprise Server (GHES), and GitHub Enterprise Cloud (GHEC). For example, the action can be executed on GitHub hosted and create pull requests on a GHES or GHEC instance.

## Updating from `v4` to `v5`

### Behaviour changes

- The action will no longer leave the local repository checked out on the pull request `branch`. Instead, it will leave the repository checked out on the branch or commit that it was when the action started.
- When using `add-paths`, uncommitted changes will no longer be destroyed. They will be stashed and restored at the end of the action run.

### What's new

- Adds input `body-path`, the path to a file containing the pull request body.
- At the end of the action run the local repository is now checked out on the branch or commit that it was when the action started.
- Any uncommitted tracked or untracked changes are now stashed and restored at the end of the action run. Currently, this can only occur when using the `add-paths` input, which allows for changes to not be committed. Previously, any uncommitted changes would be destroyed.
- The proxy implementation has been revised but is not expected to have any change in behaviour. It continues to support the standard environment variables `http_proxy`, `https_proxy` and `no_proxy`.
- Now sets the git `safe.directory` configuration for the local repository path. The configuration is removed when the action completes. Fixes issue https://github.com/peter-evans/create-pull-request/issues/1170.
- Now determines the git directory path using the `git rev-parse --git-dir` command. This allows users with custom repository configurations to use the action.
- Improved handling of the `team-reviewers` input and associated errors.

## Updating from `v3` to `v4`

### Behaviour changes

- The `add-paths` input no longer accepts `-A` as a valid value. When committing all new and modified files the `add-paths` input should be omitted.

- If using self-hosted runners or GitHub Enterprise Server, there are minimum requirements for `v4` to run. See "What's new" below for details.

### What's new

- Updated runtime to Node.js 16
  - The action now requires a minimum version of v2.285.0 for the [Actions Runner](https://github.com/actions/runner/releases/tag/v2.285.0).
  - If using GitHub Enterprise Server, the action requires [GHES 3.4](https://docs.github.com/en/enterprise-server@3.4/admin/release-notes) or later.

## Updating from `v2` to `v3`

### Behaviour changes

- The `author` input now defaults to the user who triggered the workflow run. This default is set via [action.yml](../action.yml) as `${{ github.actor }} <${{ github.actor }}@users.noreply.github.com>`, where `github.actor` is the GitHub user account associated with the run. For example, `peter-evans <peter-evans@users.noreply.github.com>`.

  To continue to use the `v2` default, set the `author` input as follows.
  ```yaml
      - uses: peter-evans/create-pull-request@v3
        with:
          author: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>
  ```

- The `author` and `committer` inputs are no longer cross-used if only one is supplied. Additionally, when neither input is set, the `author` and `committer` are no longer determined from an existing identity set in git config. In both cases, the inputs will fall back to their default set in [action.yml](../action.yml).

- Deprecated inputs `project` and `project-column` have been removed in favour of an additional action step. See [Create a project card](https://github.com/peter-evans/create-pull-request#create-a-project-card) for details.

- Deprecated output `pr_number` has been removed in favour of `pull-request-number`.

- Input `request-to-parent` has been removed in favour of `push-to-fork`. This greatly simplifies pushing the pull request branch to a fork of the parent repository. See [Push pull request branches to a fork](concepts-guidelines.md#push-pull-request-branches-to-a-fork) for details.

  e.g.
  ```yaml
      - uses: actions/checkout@v2

      # Make changes to pull request here

      - uses: peter-evans/create-pull-request@v3
        with:
          token: ${{ secrets.MACHINE_USER_PAT }}
          push-to-fork: machine-user/fork-of-repository
  ```

### What's new

- The action has been converted to Typescript giving it a significant performance improvement.

- If you run this action in a container, or on [self-hosted runners](https://docs.github.com/en/actions/hosting-your-own-runners), `python` and `pip` are no longer required dependencies. See [Running in a container or on self-hosted runners](concepts-guidelines.md#running-in-a-container-or-on-self-hosted-runners) for details.

- Inputs `labels`, `assignees`, `reviewers` and `team-reviewers` can now be newline separated, or comma separated.
  e.g.
  ```yml
          labels: |
            chore
            dependencies
            automated
  ```

## Updating from `v1` to `v2`

### Behaviour changes

- `v2` now expects repositories to be checked out with `actions/checkout@v2`

  To use `actions/checkout@v1` the following step to checkout the branch is necessary.
  ```yml
      - uses: actions/checkout@v1
      - name: Checkout branch
        run: git checkout "${GITHUB_REF:11}"
  ```

- The two branch naming strategies have been swapped. Fixed-branch naming strategy is now the default. i.e. `branch-suffix: none` is now the default and should be removed from configuration if set.

- `author-name`, `author-email`, `committer-name`, `committer-email` have been removed in favour of `author` and `committer`.
  They can both be set in the format `Display Name <email@address.com>`

  If neither `author` or `committer` are set the action will default to making commits as the GitHub Actions bot user.

### What's new

- Unpushed commits made during the workflow before the action runs will now be considered as changes to be raised in the pull request. See [Create your own commits](https://github.com/peter-evans/create-pull-request#create-your-own-commits) for details.
- New commits made to the pull request base will now be taken into account when pull requests are updated.
- If an updated pull request no longer differs from its base it will automatically be closed and the pull request branch deleted.
