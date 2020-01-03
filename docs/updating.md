# Updating from `v1` to `v2`

## Breaking changes

- `v2` now expects repositories to be checked out with `actions/checkout@v2`

  To use `actions/checkout@v1` the following step to checkout the branch is necessary.
  ```
      - uses: actions/checkout@v1
      - name: Checkout branch
        run: git checkout "${GITHUB_REF:11}"
  ```

- The two branch naming strategies have been swapped. Fixed branch naming strategy is now the default. i.e. `branch-suffix: none` is now the default and should be removed from configuration if set.

- `author-name`, `author-email`, `committer-name`, `committer-email` have been removed in favour of `author` and `committer`.
  They can both be set in the format `Display Name <email@address.com>`

  If neither `author` or `committer` are set the action will default to making commits as the GitHub Actions bot user.

## New features

- Unpushed commits made during the workflow before the action runs will now be considered as changes to be raised in the pull request. See [Controlling commits](https://github.com/peter-evans/create-pull-request#controlling-commits) for details.
- New commits made to the pull request base will now be taken into account when pull requests are updated.
- If an updated pull request no longer differs from its base it will automatically be closed and the pull request branch deleted.
