# Common issues

- [Troubleshooting](#troubleshooting)
  - [Create using an existing branch as the PR branch](#create-using-an-existing-branch-as-the-pr-branch)
- [Frequently requested features](#use-case-create-a-pull-request-to-update-x-on-release)
  - [Disable force updates to existing PR branches](#disable-force-updates-to-existing-pr-branches)
  - [Add a no-verify option to bypass git hooks](#add-a-no-verify-option-to-bypass-git-hooks)

## Troubleshooting

### Create using an existing branch as the PR branch

A common point of confusion is to try and use an existing branch containing changes to raise in a PR as the `branch` input. This will not work because the action is primarily designed to be used in workflows where the PR branch does not exist yet. The action creates and manages the PR branch itself.

If you have an existing branch that you just want to create a PR for, then I recommend using the official [GitHub CLI](https://cli.github.com/manual/gh_pr_create) in a workflow step.

Alternatively, if you are trying to keep a branch up to date with another branch, then you can follow [this example](https://github.com/peter-evans/create-pull-request/blob/main/docs/examples.md#keep-a-branch-up-to-date-with-another).

## Frequently requested features

### Disable force updates to existing PR branches

This behaviour is fundamental to how the action works and is a conscious design decision. The "rule" that I based this design on is that when a workflow executes the action to create or update a PR, the result of those two possible actions should never be different. The easiest way to maintain that consistency is to rebase the PR branch and force push it.

If you want to avoid this behaviour there are some things that might work depending on your use case:
- Check if the pull request branch exists in a separate step before the action runs and act accordingly.
- Use the [alternative strategy](https://github.com/peter-evans/create-pull-request#alternative-strategy---always-create-a-new-pull-request-branch) of always creating a new PR that won't be updated by the action.
- [Create your own commits](https://github.com/peter-evans/create-pull-request#create-your-own-commits) each time the action is created/updated.

### Add a no-verify option to bypass git hooks

Presently, there is no plan to add this feature to the action.
The reason is that I'm trying very hard to keep the interface for this action to a minimum to prevent it becoming bloated and complicated.

Git hooks must be installed after a repository is checked out in order for them to work.
So the straightforward solution is to just not install them during the workflow where this action is used.

- If hooks are automatically enabled by a framework, use an option provided by the framework to disable them. For example, for Husky users, they can be disabled with the `--ignore-scripts` flag.
- If hooks are installed in a script, then add a condition checking if the `CI` environment variable exists.
   ```sh
   #!/bin/sh

   [ -n "$CI" ] && exit 0
   ```
- If preventing the hooks installing is problematic, just delete them in a workflow step before the action runs.
   ```yml
   - run: rm .git/hooks -rf
   ```
