# Examples

- [Use case: Create a pull request to update X on push](#use-case-create-a-pull-request-to-update-x-on-push)
  - [Update project authors](#update-project-authors)
  - [Keep a branch up-to-date with another](#keep-a-branch-up-to-date-with-another)
- [Use case: Create a pull request to update X on release](#use-case-create-a-pull-request-to-update-x-on-release)
  - [Update changelog](#update-changelog)
- [Use case: Create a pull request to update X periodically](#use-case-create-a-pull-request-to-update-x-periodically)
  - [Update NPM dependencies](#update-npm-dependencies)
  - [Update Gradle dependencies](#update-gradle-dependencies)
  - [Update Cargo dependencies](#update-cargo-dependencies)
  - [Update SwaggerUI for GitHub Pages](#update-swaggerui-for-github-pages)
  - [Keep a fork up-to-date with its upstream](#keep-a-fork-up-to-date-with-its-upstream)
  - [Spider and download a website](#spider-and-download-a-website)
- [Use case: Create a pull request to update X by calling the GitHub API](#use-case-create-a-pull-request-to-update-x-by-calling-the-github-api)
  - [Call the GitHub API from an external service](#call-the-github-api-from-an-external-service)
  - [Call the GitHub API from another GitHub Actions workflow](#call-the-github-api-from-another-github-actions-workflow)
- [Use case: Create a pull request to modify/fix pull requests](#use-case-create-a-pull-request-to-modifyfix-pull-requests)
  - [autopep8](#autopep8)
- [Misc workflow tips](#misc-workflow-tips)
  - [Filtering push events](#filtering-push-events)
  - [Dynamic configuration using variables](#dynamic-configuration-using-variables)
  - [Setting the pull request body from a file](#setting-the-pull-request-body-from-a-file)
  - [Using a markdown template](#using-a-markdown-template)
  - [Debugging GitHub Actions](#debugging-github-actions)


## Use case: Create a pull request to update X on push

This pattern will work well for updating any kind of static content based on pushed changes. Care should be taken when using this pattern in repositories with a high frequency of commits.

### Update project authors

Raises a pull request to update a file called `AUTHORS` with the git user names and email addresses of contributors.

```yml
name: Update AUTHORS
on:
  push:
    branches:
      - main
jobs:
  updateAuthors:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - name: Update AUTHORS
        run: |
          git log --format='%aN <%aE>%n%cN <%cE>' | sort -u > AUTHORS
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          commit-message: update authors
          title: Update AUTHORS
          body: Credit new contributors by updating AUTHORS
          branch: update-authors
```

### Keep a branch up-to-date with another

This is a use case where a branch should be kept up to date with another by opening a pull request to update it. The pull request should then be updated with new changes until it is merged or closed.

In this example scenario, a branch called `production` should be updated via pull request to keep it in sync with `main`. Merging the pull request is effectively promoting those changes to production.

```yml
name: Create production promotion pull request
on:
  push:
    branches:
      - main
jobs:
  productionPromotion:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          ref: production
      - name: Reset promotion branch
        run: |
          git fetch origin main:main
          git reset --hard main
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          branch: production-promotion
```

## Use case: Create a pull request to update X on release

This pattern will work well for updating any kind of static content based on the tagged commit of a release. Note that because `release` is one of the [events which checkout a commit](concepts-guidelines.md#events-which-checkout-a-commit) it is necessary to supply the `base` input to the action.

### Update changelog

Raises a pull request to update the `CHANGELOG.md` file based on the tagged commit of the release.
Note that [git-chglog](https://github.com/git-chglog/git-chglog/) requires some configuration files to exist in the repository before this workflow will work.

This workflow assumes the tagged release was made on a default branch called `main`.

```yml
name: Update Changelog
on:
  release:
    types: [published]
jobs:
  updateChangelog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - name: Update Changelog
        run: |
          curl -o git-chglog -L https://github.com/git-chglog/git-chglog/releases/download/0.9.1/git-chglog_linux_amd64
          chmod u+x git-chglog
          ./git-chglog -o CHANGELOG.md
          rm git-chglog
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          commit-message: update changelog
          title: Update Changelog
          body: Update changelog to reflect release changes
          branch: update-changelog
          base: main
```

## Use case: Create a pull request to update X periodically

This pattern will work well for updating any kind of static content from an external source. The workflow executes on a schedule and raises a pull request when there are changes.

### Update NPM dependencies

This workflow will create a pull request for npm dependencies.
It works best in combination with a build workflow triggered on `push` and `pull_request`.
A [Personal Access Token (PAT)](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) can be used in order for the creation of the pull request to trigger further workflows. See the [documentation here](concepts-guidelines.md#triggering-further-workflow-runs) for further details.

```yml
name: Update Dependencies
on:
  schedule:
    - cron:  '0 10 * * 1'
jobs:
  update-dep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: '12.x'
      - name: Update dependencies
        run: |
          npx -p npm-check-updates ncu -u
          npm install
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
            token: ${{ secrets.PAT }}
            commit-message: Update dependencies
            title: Update dependencies
            body: |
              - Dependency updates
  
              Auto-generated by [create-pull-request][1]
  
              [1]: https://github.com/peter-evans/create-pull-request
            branch: update-dependencies
```

The above workflow works best in combination with a build workflow triggered on `push` and `pull_request`.

```yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: 12.x
      - run: npm ci
      - run: npm run test
      - run: npm run build
```

### Update Gradle dependencies

The following workflow will create a pull request for Gradle dependencies.
It requires first configuring your project to use Gradle lockfiles.
See [here](https://github.com/peter-evans/gradle-auto-dependency-updates) for how to configure your project and use the following workflow.

```yml
name: Update Dependencies
on:
  schedule:
    - cron:  '0 1 * * 1'
jobs:
  update-dep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-java@v1
        with:
          java-version: 1.8
      - name: Grant execute permission for gradlew
        run: chmod +x gradlew
      - name: Perform dependency resolution and write new lockfiles
        run: ./gradlew dependencies --write-locks
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
            token: ${{ secrets.PAT }}
            commit-message: Update dependencies
            title: Update dependencies
            body: |
              - Dependency updates
  
              Auto-generated by [create-pull-request][1]
  
              [1]: https://github.com/peter-evans/create-pull-request
            branch: update-dependencies
```

### Update Cargo dependencies

The following workflow will create a pull request for Cargo dependencies.
It optionally uses [`cargo-edit`](https://github.com/killercup/cargo-edit) to update `Cargo.toml` and keep it in sync with `Cargo.lock`.

```yml
name: Update Dependencies
on:
  schedule:
    - cron:  '0 1 * * 1'
jobs:
  update-dep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Update dependencies
        run: |
          cargo install cargo-edit
          cargo update
          cargo upgrade --to-lockfile
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
            token: ${{ secrets.PAT }}
            commit-message: Update dependencies
            title: Update dependencies
            body: |
              - Dependency updates
  
              Auto-generated by [create-pull-request][1]
  
              [1]: https://github.com/peter-evans/create-pull-request
            branch: update-dependencies
```

### Update SwaggerUI for GitHub Pages

When using [GitHub Pages to host Swagger documentation](https://github.com/peter-evans/swagger-github-pages), this workflow updates the repository with the latest distribution of [SwaggerUI](https://github.com/swagger-api/swagger-ui).

You must create a file called `swagger-ui.version` at the root of your repository before running.
```yml
name: Update Swagger UI
on:
  schedule:
    - cron:  '0 10 * * *'
jobs:
  updateSwagger:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Get Latest Swagger UI Release
        id: swagger-ui
        run: |
          echo ::set-output name=release_tag::$(curl -sL https://api.github.com/repos/swagger-api/swagger-ui/releases/latest | jq -r ".tag_name")
          echo ::set-output name=current_tag::$(<swagger-ui.version)
      - name: Update Swagger UI
        if: steps.swagger-ui.outputs.current_tag != steps.swagger-ui.outputs.release_tag
        env:
          RELEASE_TAG: ${{ steps.swagger-ui.outputs.release_tag }}
          SWAGGER_YAML: "swagger.yaml"
        run: |
          # Delete the dist directory and index.html
          rm -fr dist index.html
          # Download the release
          curl -sL -o $RELEASE_TAG https://api.github.com/repos/swagger-api/swagger-ui/tarball/$RELEASE_TAG
          # Extract the dist directory
          tar -xzf $RELEASE_TAG --strip-components=1 $(tar -tzf $RELEASE_TAG | head -1 | cut -f1 -d"/")/dist
          rm $RELEASE_TAG
          # Move index.html to the root
          mv dist/index.html .
          # Fix references in index.html
          sed -i "s|https://petstore.swagger.io/v2/swagger.json|$SWAGGER_YAML|g" index.html
          sed -i "s|href=\"./|href=\"dist/|g" index.html
          sed -i "s|src=\"./|src=\"dist/|g" index.html
          # Update current release
          echo ${{ steps.swagger-ui.outputs.release_tag }} > swagger-ui.version
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          commit-message: Update swagger-ui to ${{ steps.swagger-ui.outputs.release_tag }}
          title: Update SwaggerUI to ${{ steps.swagger-ui.outputs.release_tag }}
          body: |
            Updates [swagger-ui][1] to ${{ steps.swagger-ui.outputs.release_tag }}

            Auto-generated by [create-pull-request][2]

            [1]: https://github.com/swagger-api/swagger-ui
            [2]: https://github.com/peter-evans/create-pull-request
          labels: dependencies, automated pr
          branch: swagger-ui-updates
```

### Keep a fork up-to-date with its upstream

This example is designed to be run in a seperate repository from the fork repository itself.
The aim of this is to prevent committing anything to the fork's default branch would cause it to differ from the upstream.

In the following example workflow, `owner/repo` is the upstream repository and `fork-owner/repo` is the fork. It assumes the default branch of the upstream repository is called `main`.

The [Personal Access Token (PAT)](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token) should have `repo` scope. Additionally, if the upstream makes changes to the `.github/workflows` directory, the action will be unable to push the changes to a branch and throw the error "_(refusing to allow a GitHub App to create or update workflow `.github/workflows/xxx.yml` without `workflows` permission)_". To allow these changes to be pushed to the fork, add the `workflow` scope to the PAT. Of course, allowing this comes with the risk that the workflow changes from the upstream could run and do something unexpected. Disabling GitHub Actions in the fork is highly recommended to prevent this.

When you merge the pull request make sure to choose the [`Rebase and merge`](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/about-pull-request-merges#rebase-and-merge-your-pull-request-commits) option. This will make the fork's commits match the commits on the upstream.

```yml
name: Update fork
on:
  schedule:
    - cron:  '0 0 * * 0'
jobs:
  updateFork:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          repository: fork-owner/repo
      - name: Reset the default branch with upstream changes
        run: |
          git remote add upstream https://github.com/owner/repo.git
          git fetch upstream main:upstream-main
          git reset --hard upstream-main
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          token: ${{ secrets.PAT }}
          branch: upstream-changes
```

### Spider and download a website

This workflow spiders a website and downloads the content. Any changes to the website will be raised in a pull request.

```yml
name: Download Website
on:
  schedule:
    - cron:  '0 10 * * *'
jobs:
  format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
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
        uses: peter-evans/create-pull-request@v3
        with:
          commit-message: update local website copy
          title: Automated Updates to Local Website Copy
          body: This is an auto-generated PR with website updates.
          branch: website-updates
```

## Use case: Create a pull request to update X by calling the GitHub API

You can use the GitHub API to trigger a webhook event called [`repository_dispatch`](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#repository_dispatch) when you want to trigger a workflow for any activity that happens outside of GitHub.
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
- `[token]` is a `repo` scoped [Personal Access Token](https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token)
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
  uses: peter-evans/repository-dispatch@v1
  with:
    token: ${{ secrets.REPO_ACCESS_TOKEN }}
    repository: username/my-repo
    event-type: create-pull-request
    client-payload: '{"ref": "${{ github.ref }}", "sha": "${{ github.sha }}"}'
```

## Use case: Create a pull request to modify/fix pull requests

**Note**: While the following approach does work, my strong recommendation would be to use a slash command style "ChatOps" solution for operations on pull requests. See [slash-command-dispatch](https://github.com/peter-evans/slash-command-dispatch) for such a solution.

This is a pattern that lends itself to automated code linting and fixing. A pull request can be created to fix or modify something during an `on: pull_request` workflow. The pull request containing the fix will be raised with the original pull request as the base. This can be then be merged to update the original pull request and pass any required tests.

Note that due to [token restrictions on public repository forks](https://docs.github.com/en/actions/configuring-and-managing-workflows/authenticating-with-the-github_token#permissions-for-the-github_token), workflows for this use case do not work for pull requests raised from forks.
Private repositories can be configured to [enable workflows](https://docs.github.com/en/github/administering-a-repository/disabling-or-limiting-github-actions-for-a-repository#enabling-workflows-for-private-repository-forks) from forks to run without restriction. 

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
      - uses: actions/checkout@v2
        with:
          ref: ${{ github.head_ref }}
      - name: autopep8
        id: autopep8
        uses: peter-evans/autopep8@v1
        with:
          args: --exit-code --recursive --in-place --aggressive --aggressive .
      - name: Set autopep8 branch name
        id: vars
        run: echo ::set-output name=branch-name::"autopep8-patches/${{ github.head_ref }}"
      - name: Create Pull Request
        if: steps.autopep8.outputs.exit-code == 2
        uses: peter-evans/create-pull-request@v3
        with:
          commit-message: autopep8 action fixes
          title: Fixes by autopep8 action
          body: This is an auto-generated PR with fixes by autopep8.
          labels: autopep8, automated pr
          branch: ${{ steps.vars.outputs.branch-name }}
      - name: Fail if autopep8 made changes
        if: steps.autopep8.outputs.exit-code == 2
        run: exit 1
```

## Misc workflow tips

### Filtering push events

For workflows using `on: push` you may want to ignore push events for tags and only execute for branches. Specifying `branches` causes only events on branches to trigger the workflow. The `'**'` wildcard will match any branch name.

```yml
on:
  push:
    branches:
      - '**' 
```

If you have a workflow that contains jobs to handle push events on branches as well as tags, you can make sure that the job where you use `create-pull-request` action only executes when `github.ref` is a branch by using an `if` condition as follows.

```yml
on: push
jobs:
  createPullRequest:
    if: startsWith(github.ref, 'refs/heads/')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      ...

  someOtherJob:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      ...
```

### Dynamic configuration using variables

The following examples show how configuration for the action can be dynamically defined in a previous workflow step.

The recommended method is to use [`set-output`](https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions#setting-an-output-parameter). Note that the step where output variables are defined must have an id.

```yml
      - name: Set output variables
        id: vars
        run: |
          echo ::set-output name=pr_title::"[Test] Add report file $(date +%d-%m-%Y)"
          echo ::set-output name=pr_body::"This PR was auto-generated on $(date +%d-%m-%Y) \
            by [create-pull-request](https://github.com/peter-evans/create-pull-request)."
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          title: ${{ steps.vars.outputs.pr_title }}
          body: ${{ steps.vars.outputs.pr_body }}
```

### Setting the pull request body from a file

This example shows how file content can be read into a variable and passed to the action.
The content must be [escaped to preserve newlines](https://github.community/t/set-output-truncates-multiline-strings/16852/3).

```yml
      - id: get-pr-body
        run: |
          body=$(cat pr-body.txt)
          body="${body//'%'/'%25'}"
          body="${body//$'\n'/'%0A'}"
          body="${body//$'\r'/'%0D'}" 
          echo ::set-output name=body::$body

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          body: ${{ steps.get-pr-body.outputs.body }}
```

### Using a markdown template

In this example, a markdown template file is added to the repository at `.github/pull-request-template.md` with the following content.
```
This is a test pull request template
Render template variables such as {{ .foo }} and {{ .bar }}.
```

The template is rendered using the [render-template](https://github.com/chuhlomin/render-template) action and the result is used to create the pull request.
```yml
      - name: Render template
        id: template
        uses: chuhlomin/render-template@v1.2
        with:
          template: .github/pull-request-template.md
          vars: |
            foo: this
            bar: that

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          body: ${{ steps.template.outputs.result }}
```

### Debugging GitHub Actions

#### Runner Diagnostic Logging

[Runner diagnostic logging](https://docs.github.com/en/actions/configuring-and-managing-workflows/managing-a-workflow-run#enabling-runner-diagnostic-logging) provides additional log files that contain information about how a runner is executing an action.
To enable runner diagnostic logging, set the secret `ACTIONS_RUNNER_DEBUG` to `true` in the repository that contains the workflow.

#### Step Debug Logging

[Step debug logging](https://docs.github.com/en/actions/configuring-and-managing-workflows/managing-a-workflow-run#enabling-step-debug-logging) increases the verbosity of a job's logs during and after a job's execution.
To enable step debug logging set the secret `ACTIONS_STEP_DEBUG` to `true` in the repository that contains the workflow.

#### Output Various Contexts

```yml
    steps:
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
