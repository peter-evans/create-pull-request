# Examples

- [Use case: Create a pull request to update X periodically](#use-case-create-a-pull-request-to-update-x-periodically)
  - [Update NPM dependencies](#update-npm-dependencies)
  - [Keep Go up to date](#keep-go-up-to-date)
  - [Spider and download a website](#spider-and-download-a-website)
- [Use case: Create a pull request to modify/fix pull requests](#use-case-create-a-pull-request-to-modifyfix-pull-requests)
  - [autopep8](#autopep8)
- [Misc workflow tips](#misc-workflow-tips)
  - [Filtering push events](#filtering-push-events)
  - [Dynamic configuration using variables](#dynamic-configuration-using-variables)


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
        uses: peter-evans/create-pull-request@v1.6.1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COMMIT_MESSAGE: update dependencies
          PULL_REQUEST_TITLE: Automated Dependency Updates
          PULL_REQUEST_BODY: This is an auto-generated PR with dependency updates.
          PULL_REQUEST_BRANCH: dep-updates
          BRANCH_SUFFIX: none
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
        uses: peter-evans/create-pull-request@v1.6.1
        env:
          PULL_REQUEST_TITLE: ${{ steps.pr_title_maker.outputs.pr_title }}
          PULL_REQUEST_BODY: Auto-generated pull request created by the GitHub Actions [create-pull-request](https://github.com/peter-evans/create-pull-request) and [ensure-latest-go](https://github.com/jmhodges/ensure-latest-go).
          COMMIT_MESSAGE: ${{ steps.pr_title_maker.outputs.pr_title }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BRANCH_SUFFIX: none
          PULL_REQUEST_BRANCH: ensure-latest-go/patch-${{ steps.ensure_go.outputs.go_version }}
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
        uses: peter-evans/create-pull-request@v1.6.1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COMMIT_MESSAGE: update local website copy
          PULL_REQUEST_TITLE: Automated Updates to Local Website Copy
          PULL_REQUEST_BODY: This is an auto-generated PR with website updates.
          PULL_REQUEST_BRANCH: website-updates
          BRANCH_SUFFIX: none
```

## Use case: Create a pull request to modify/fix pull requests

This is a pattern that works well for any automated code linting and fixing. A pull request can be created to fix or modify something during an `on: pull_request` workflow. The pull request containing the fix will be raised with the original pull request as the base. This can be then be merged to update the original pull request and pass any required tests.

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
    if: startsWith(github.head_ref, 'autopep8-patches') == false
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
        uses: peter-evans/create-pull-request@v1.6.1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          COMMIT_MESSAGE: autopep8 action fixes
          PULL_REQUEST_TITLE: Fixes by autopep8 action
          PULL_REQUEST_BODY: This is an auto-generated PR with fixes by autopep8.
          PULL_REQUEST_LABELS: autopep8, automated pr
          PULL_REQUEST_BRANCH: ${{ steps.vars.outputs.branch-name }}
          BRANCH_SUFFIX: none
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
        uses: peter-evans/create-pull-request@v1.6.1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PULL_REQUEST_TITLE: ${{ steps.vars.outputs.pr_title }}
          PULL_REQUEST_BODY: ${{ steps.vars.outputs.pr_body }}
```

Since the action reads environment variables from the system, it's technically not necessary to explicitly pass them as long as they exist in the environment. So the following method using `set-env` *also* works, but explicitly passing the configuration parameters using the previous method is perferred for its clarity.

```yml
      - name: Set environment variables
        run: |
          echo ::set-env name=PULL_REQUEST_TITLE::"[Test] Add report file $(date +%d-%m-%Y)"
          echo ::set-env name=PULL_REQUEST_BODY::"This PR was auto-generated on $(date +%d-%m-%Y) \
            by [create-pull-request](https://github.com/peter-evans/create-pull-request)."
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v1.6.1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
