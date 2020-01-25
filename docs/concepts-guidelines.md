# Concepts and guidelines

This document covers terminology, how the action works, and general usage guidelines.

- [Terminology](#terminology)
- [Events and checkout](#events-and-checkout)
- [How the action works](#how-the-action-works)
- [Guidelines](#guidelines)
  - [Providing a consistent base](#providing-a-consistent-base)
  - [Pull request events](#pull-request-events)
  - [Restrictions on forked repositories](#restrictions-on-forked-repositories)
  - [Tag push events](#tag-push-events)
  - [Security](#security)

## Terminology

[Pull requests](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-requests#about-pull-requests) are proposed changes to a repository branch that can be reviewed by a repository's collaborators before being accepted or rejected. 

A pull request references two branches:

- The `base` of a pull request is the branch you intend to change once the proposed changes are merged.
- The `branch` of a pull request represents what you intend the `base` to look like when merged. It is the `base` branch *plus* changes that have been made to it.

## Events and checkout

For each [event type](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/events-that-trigger-workflows) there is a default `GITHUB_SHA` that will be checked out by the GitHub Actions [checkout](https://github.com/actions/checkout) action.

The majority of events will default to checking out the "last commit on default branch," which in most cases will be the latest commit on `master`.

The default can be overridden by specifying a `ref` on checkout.

```yml
      - uses: actions/checkout@v2
        with:
          ref: develop
```

## How the action works

By default, the action expects to be executed on the pull request `base`&mdash;the branch you intend to modify with the proposed changes.

Workflow steps:

1. Checkout the `base` branch
2. Make changes
3. Execute `create-pull-request` action

The following git diagram shows how the action creates and updates a pull request branch.

![Create Pull Request GitGraph](assets/cpr-gitgraph.png)

## Guidelines

### Providing a consistent base

For the action to work correctly it should be executed in a workflow that checks out a *consistent base* branch. This will be the base of the pull request unless overridden with the `base` input.

This means your workflow should be consistently checking out the branch that you intend to modify once the PR is merged.

In the following example, the [`push`](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/events-that-trigger-workflows#push-event-push) and [`create`](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/events-that-trigger-workflows#create-event-create) events both trigger the same workflow. This will cause the checkout action to checkout commits from inconsistent branches. Do *not* do this. It will cause multiple pull requests to be created for each additional `base` the action is executed against.

```yml
on:
  push:
  create:
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
```

Although rare, there may be use cases where it makes sense to execute the workflow on a branch that is not the base of the pull request. In these cases, the base branch can be specified with the `base` action input. The action will attempt to rebase changes made during the workflow on to the actual base.

### Pull request events

Workflows triggered by `pull_request` events will by default check out a [merge commit](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/events-that-trigger-workflows#pull-request-event-pull_request). To prevent the merge commit being included in created pull requests it is necessary to checkout the `head_ref`.

```yml
      - uses: actions/checkout@v2
        with:
          ref: ${{ github.head_ref }}
```

### Restrictions on forked repositories

GitHub Actions have imposed restrictions on events triggered by a forked repository. For example, the `pull_request` event triggered by a fork opening a pull request in the upstream repository.

- Events from forks cannot access secrets, except for for the default `GITHUB_TOKEN`.
    > With the exception of GITHUB_TOKEN, secrets are not passed to the runner when a workflow is triggered from a forked repository.

    [GitHub Actions: Using encrypted secrets in a workflow](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets#using-encrypted-secrets-in-a-workflow)

- The `GITHUB_TOKEN` has read-only access when an event is triggered by a forked repository.

   [GitHub Actions: Permissions for the GITHUB_TOKEN](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#permissions-for-the-github_token)

These restrictions mean that during a `pull_request` event triggered by a forked repository the action will be unable to commit changes to a branch.

A job condition can be added to prevent workflows from executing when triggered by a repository fork.

```yml
on: pull_request
jobs:
  example:
    runs-on: ubuntu-latest
    # Check if the event is not triggered by a fork
    if: github.event.pull_request.head.repo.full_name == github.repository
```

### Tag push events

An `on: push` workflow will also trigger when tags are pushed.
During these events, the `actions/checkout` action will check out the `ref/tags/<tag>` git ref by default.
This means the repository will *not* be checked out on an active branch.

If you would like to run `create-pull-request` action on the tagged commit you can achieve this by creating a temporary branch as follows.

```yml
on:
  push:
    tags:
      - 'v*.*.*'
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Create a temporary tag branch
        run: |
          git config --global user.name 'GitHub'
          git config --global user.email 'noreply@github.com'
          git checkout -b temp-${GITHUB_REF:10}
          git push --set-upstream origin temp-${GITHUB_REF:10}

      - name: Create changes to pull request
        run: <create changes here>

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          base: master

      - name: Delete tag branch
        run: |
          git push --delete origin temp-${GITHUB_REF:10}
```

This is an alternative, simpler workflow to the one above. However, this is not guaranteed to checkout the tagged commit.
There is a chance that in between the tag being pushed and checking out the `master` branch in the workflow, another commit is made to `master`. If that possibility is not a concern, this workflow will work fine.

```yml
on:
  push:
    tags:
      - 'v*.*.*'
jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          ref: master

      - name: Create changes to pull request
        run: <create changes here>

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

### Security

From a security perspective it's good practice to fork third-party actions, review the code, and use your fork of the action in workflows.
By using third-party actions directly the risk exists that it could be modified to do something malicious, such as capturing secrets.

This action uses [ncc](https://github.com/zeit/ncc) to compile the Node.js code and dependencies into a single file.
Python dependencies are vendored and committed to the repository [here](https://github.com/peter-evans/create-pull-request/tree/master/dist/vendor).
No dependencies are downloaded during the action execution.

Vendored Python dependencies can be reviewed by rebuilding the [dist](https://github.com/peter-evans/create-pull-request/tree/master/dist) directory and redownloading dependencies.
The following commands require Node and Python 3.

```
npm install
npm run clean
npm run package
```

The `dist` directory should be rebuilt leaving no git diff.
