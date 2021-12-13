## Updating from `v2` to `v3`

### Breaking changes

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

### New features

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

### Breaking changes

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

### New features

- Unpushed commits made during the workflow before the action runs will now be considered as changes to be raised in the pull request. See [Create your own commits](https://github.com/peter-evans/create-pull-request#create-your-own-commits) for details.
- New commits made to the pull request base will now be taken into account when pull requests are updated.
- If an updated pull request no longer differs from its base it will automatically be closed and the pull request branch deleted.
