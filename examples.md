# Examples

- [Use case: Create a pull request to update X periodically](#use-case-create-a-pull-request-to-update-x-periodically)
  - [Update NPM dependencies](#update-npm-dependencies)
  - [Keep Go up to date](#keep-go-up-to-date)
  - [Spider and download a website](#spider-and-download-a-website)
- [Use case: Create a pull request to update X by calling the GitHub API](#use-case-create-a-pull-request-to-update-x-by-calling-the-github-api)
  - [Call the GitHub API from an external service](#call-the-github-api-from-an-external-service)
  - [Call the GitHub API from another GitHub Actions workflow](#call-the-github-api-from-another-github-actions-workflow)
- [Use case: Create a pull request to modify/fix pull requests](#use-case-create-a-pull-request-to-modifyfix-pull-requests)
  - [autopep8](#autopep8)
- [Misc workflow tips](#misc-workflow-tips)
  - [Filtering push events](#filtering-push-events)
  - [Dynamic configuration using variables](#dynamic-configuration-using-variables)
  - [Debugging GitHub Actions](#debugging-github-actions)


## Use case: Create a pull request to update X periodically

This pattern will work well for updating any kind of static content from an external source. The workflow executes on a schedule and raises a pull request when there are changes.

### Update NPM dependencies

```yml
name: Update Dependencies
on:
  schedule:
    - cron:  '0 10 * * 1'
jobs:
  update-deps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      - uses: actions/setup-node@v1
        with:
          node-version: '10.x'
      - name: Update dependencies
        id: vars
        run: |
          npm install -g npm-check-updates
          ncu -u
          npm install
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v1.7.2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: update dependencies
          title: Automated Dependency Updates
          body: This is an auto-generated PR with dependency updates.
          branch: dep-updates
          branch-suffix: none
```

### Keep Go up to date

Keep Go up to date with [ensure-latest-go](https://github.com/jmhodges/ensure-latest-go) action.

```yml
name: Keeping Go up to date
on:
  schedule:
    - cron: 47 4 * * *
  push:
    branches:
      - master
jobs:
  fresh_go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
        with:
          ref: master
      - uses: jmhodges/ensure-latest-go@v1.0.2
        id: ensure_go
      - run: echo "##[set-output name=pr_title;]update to latest Go release ${{ steps.ensure_go.outputs.go_version}}"
        id: pr_title_maker
      - name: Create pull request
        uses: peter-evans/create-pull-request@v1.7.2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          title: ${{ steps.pr_title_maker.outputs.pr_title }}
          body: Auto-generated pull request created by the GitHub Actions [create-pull-request](https://github.com/peter-evans/create-pull-request) and [ensure-latest-go](https://github.com/jmhodges/ensure-latest-go).
          commit-message: ${{ steps.pr_title_maker.outputs.pr_title }}
          branch-suffix: none
          branch: ensure-latest-go/patch-${{ steps.ensure_go.outputs.go_version }}
```

### Spider and download a website

```yml
name: Download Website
on:
  schedule:
    - cron:  '0 10 * * *'
jobs:
  format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      - name: Download website
        run: |
          wget \
            --recursive \
            --level=2 \
            --wait=1 \
            --no-clobber \
            --page-requisites \
            --html-extension \
            --convert-links \
            --domains quotes.toscrape.com \
            http://quotes.toscrape.com/
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v1.7.2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: update local website copy
          title: Automated Updates to Local Website Copy
          body: This is an auto-generated PR with website updates.
          branch: website-updates
          branch-suffix: none
```

## Use case: Create a pull request to update X by calling the GitHub API

You can use the GitHub API to trigger a webhook event called [`repository_dispatch`](https://help.github.com/en/github/automating-your-workflow-with-github-actions/events-that-trigger-workflows#external-events-repository_dispatch) when you want to trigger a workflow for activity that happens outside of GitHub.
This pattern will work well for updating any kind of static content from an external source.

You can modify any of the examples in the previous section to work in this fashion.

Set the workflow to execute `on: repository_dispatch`.

```yml
on:
  repository_dispatch:
    types: [create-pull-request]
```

### Call the GitHub API from an external service

An `on: repository_dispatch` workflow can be triggered by a call to the GitHub API as follows.

- `[username]` is a GitHub username
- `[token]` is a `repo` scoped [Personal Access Token](https://help.github.com/en/articles/creating-a-personal-access-token-for-the-command-line)
- `[repository]` is the name of the repository the workflow resides in.

```
curl -XPOST -u "[username]:[token]" \
  -H "Accept: application/vnd.github.everest-preview+json" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/[username]/[repository]/dispatches \
  --data '{"event_type": "create-pull-request"}'
```

### Call the GitHub API from another GitHub Actions workflow

An `on: repository_dispatch` workflow can be triggered from another workflow with [repository-dispatch](https://github.com/peter-evans/repository-dispatch) action.

```yml
- name: Repository Dispatch
  uses: peter-evans/repository-dispatch@v1.0.0
  with:
    token: ${{ secrets.REPO_ACCESS_TOKEN }}
    repository: username/my-repo
    event-type: create-pull-request
    client-payload: '{"ref": "${{ github.ref }}", "sha": "${{ github.sha }}"}'
```

## Use case: Create a pull request to modify/fix pull requests

This is a pattern that works well for any automated code linting and fixing. A pull request can be created to fix or modify something during an `on: pull_request` workflow. The pull request containing the fix will be raised with the original pull request as the base. This can be then be merged to update the original pull request and pass any required tests.

Note that due to [limitations on forked repositories](https://help.github.com/en/github/automating-your-workflow-with-github-actions/virtual-environments-for-github-actions#token-permissions) workflows for this use case do not work for pull requests raised from forks.

### autopep8

The following is an example workflow for a use case where [autopep8 action](https://github.com/peter-evans/autopep8) runs as both a check on pull requests and raises a further pull request to apply code fixes.

How it works:

1. When a pull request is raised the workflow executes as a check
2. If autopep8 makes any fixes a pull request will be raised for those fixes to be merged into the current pull request branch. The workflow then deliberately causes the check to fail.
3. When the pull request containing the fixes is merged the workflow runs again. This time autopep8 makes no changes and the check passes.
4. The original pull request can now be merged.

```yml
name: autopep8
on: pull_request
jobs:
  autopep8:
    # Check if the PR is not raised by this workflow and is not from a fork
    if: startsWith(github.head_ref, 'autopep8-patches') == false && github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      - name: autopep8
        id: autopep8
        uses: peter-evans/autopep8@v1.1.0
        with:
          args: --exit-code --recursive --in-place --aggressive --aggressive .
      - name: Set autopep8 branch name
        id: vars
        run: echo ::set-output name=branch-name::"autopep8-patches/$GITHUB_HEAD_REF"
      - name: Create Pull Request
        if: steps.autopep8.outputs.exit-code == 2
        uses: peter-evans/create-pull-request@v1.7.2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: autopep8 action fixes
          title: Fixes by autopep8 action
          body: This is an auto-generated PR with fixes by autopep8.
          labels: autopep8, automated pr
          branch: ${{ steps.vars.outputs.branch-name }}
          branch-suffix: none
      - name: Fail if autopep8 made changes
        if: steps.autopep8.outputs.exit-code == 2
        run: exit 1
```

## Misc workflow tips

### Filtering push events

For workflows using `on: push` you may want to ignore push events for tags and remotes.
These can be filtered out with the following `if` condition.

```yml
name: Create Pull Request
on: push
jobs:
  createPullRequest:
    if: startsWith(github.ref, 'refs/heads/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v1
      ...
```

### Dynamic configuration using variables

The following examples show how configuration for the action can be dynamically defined in a previous workflow step.

The recommended method is to use [`set-output`](https://help.github.com/en/github/automating-your-workflow-with-github-actions/development-tools-for-github-actions#set-an-output-parameter-set-output). Note that the step where output variables are defined must have an id.

```yml
      - name: Set output variables
        id: vars
        run: |
          echo ::set-output name=pr_title::"[Test] Add report file $(date +%d-%m-%Y)"
          echo ::set-output name=pr_body::"This PR was auto-generated on $(date +%d-%m-%Y) \
            by [create-pull-request](https://github.com/peter-evans/create-pull-request)."
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v1.7.2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          title: ${{ steps.vars.outputs.pr_title }}
          body: ${{ steps.vars.outputs.pr_body }}
```

Alternatively, [`set-env`](https://help.github.com/en/github/automating-your-workflow-with-github-actions/development-tools-for-github-actions#set-an-environment-variable-set-env) can be used to create environment variables.

```yml
      - name: Set environment variables
        run: |
          echo ::set-env name=PULL_REQUEST_TITLE::"[Test] Add report file $(date +%d-%m-%Y)"
          echo ::set-env name=PULL_REQUEST_BODY::"This PR was auto-generated on $(date +%d-%m-%Y) \
            by [create-pull-request](https://github.com/peter-evans/create-pull-request)."
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v1.7.2
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          title: ${{ env.PULL_REQUEST_TITLE }}
          body: ${{ env.PULL_REQUEST_BODY }}
```

### Debugging GitHub Actions

**Step Debug Logging** : To enable step debug logging set the secret `ACTIONS_STEP_DEBUG` to `true` in the repository that contains the workflow.

**Output Various Contexts**

```yml
      - name: Dump event JSON
        env:
          EVENT_JSON_FILENAME: ${{ github.event_path }}
        run: cat "$EVENT_JSON_FILENAME"
      - name: Dump GitHub context
        env:
          GITHUB_CONTEXT: ${{ toJson(github) }}
        run: echo "$GITHUB_CONTEXT"
      - name: Dump job context
        env:
          JOB_CONTEXT: ${{ toJson(job) }}
        run: echo "$JOB_CONTEXT"
      - name: Dump steps context
        env:
          STEPS_CONTEXT: ${{ toJson(steps) }}
        run: echo "$STEPS_CONTEXT"
      - name: Dump runner context
        env:
          RUNNER_CONTEXT: ${{ toJson(runner) }}
        run: echo "$RUNNER_CONTEXT"
      - name: Dump strategy context
        env:
          STRATEGY_CONTEXT: ${{ toJson(strategy) }}
        run: echo "$STRATEGY_CONTEXT"
      - name: Dump matrix context
        env:
          MATRIX_CONTEXT: ${{ toJson(matrix) }}
        run: echo "$MATRIX_CONTEXT"
```
