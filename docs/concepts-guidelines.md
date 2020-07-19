# Concepts, guidelines and advanced usage

This document covers terminology, how the action works, general usage guidelines, and advanced usage.

- [Terminology](#terminology)
- [Events and checkout](#events-and-checkout)
- [How the action works](#how-the-action-works)
- [Guidelines](#guidelines)
  - [Providing a consistent base](#providing-a-consistent-base)
  - [Pull request events](#pull-request-events)
  - [Restrictions on forked repositories](#restrictions-on-forked-repositories)
  - [Triggering further workflow runs](#triggering-further-workflow-runs)
  - [Security](#security)
- [Advanced usage](#advanced-usage)
  - [Creating pull requests in a remote repository](#creating-pull-requests-in-a-remote-repository)
  - [Push using SSH (deploy keys)](#push-using-ssh-deploy-keys)
  - [Push pull request branches to a fork](#push-pull-request-branches-to-a-fork)
  - [Authenticating with GitHub App generated tokens](#authenticating-with-github-app-generated-tokens)
  - [Running in a container](#running-in-a-container)
  - [Creating pull requests on tag push](#creating-pull-requests-on-tag-push)

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

GitHub Actions have imposed restrictions on events triggered by a forked repository. Specifically, the `pull_request` event triggered by a fork opening a pull request in the upstream repository.

- Events from forks cannot access secrets, except for for the default `GITHUB_TOKEN`.
    > With the exception of GITHUB_TOKEN, secrets are not passed to the runner when a workflow is triggered from a forked repository.

    [GitHub Actions: Using encrypted secrets in a workflow](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets#using-encrypted-secrets-in-a-workflow)

- The `GITHUB_TOKEN` has read-only access when an event is triggered by a forked repository.

   [GitHub Actions: Permissions for the GITHUB_TOKEN](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token#permissions-for-the-github_token)

These restrictions mean that during a `pull_request` event triggered by a forked repository, actions have no write access to GitHub resources and will fail on attempt.

A job condition can be added to prevent workflows from executing when triggered by a repository fork.

```yml
on: pull_request
jobs:
  example:
    runs-on: ubuntu-latest
    # Check if the event is not triggered by a fork
    if: github.event.pull_request.head.repo.full_name == github.repository
```

### Triggering further workflow runs

Pull requests created by the action using the default `GITHUB_TOKEN` cannot trigger other workflows. If you have `on: pull_request` or `on: push` workflows acting as checks on pull requests, they will not run.

> When you use the repository's GITHUB_TOKEN to perform tasks on behalf of the GitHub Actions app, events triggered by the GITHUB_TOKEN will not create a new workflow run.

[GitHub Actions: Events that trigger workflows](https://help.github.com/en/actions/reference/events-that-trigger-workflows#triggering-new-workflows-using-a-personal-access-token)

#### Workarounds to trigger further workflow runs

There are a number of workarounds with different pros and cons.

- Use the default `GITHUB_TOKEN` and allow the action to create pull requests that have no checks enabled. Manually close pull requests and immediately reopen them. This will enable `on: pull_request` workflows to run and be added as checks.
- Use a `repo` scoped [Personal Access Token (PAT)](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line) created on an account that has write access to the repository that pull requests are being created in. This is the standard workaround and [recommended by GitHub](https://help.github.com/en/actions/reference/events-that-trigger-workflows#triggering-new-workflows-using-a-personal-access-token). However, the PAT cannot be scoped to a specific repository so the token becomes a very sensitive secret. If this is a concern, the PAT can instead be created for a dedicated [machine account](https://help.github.com/en/github/site-policy/github-terms-of-service#3-account-requirements) that has collaborator access to the repository. Also note that because the account that owns the PAT will be the creator of pull requests, that user account will be unable to perform actions such as request changes or approve the pull request.
- Use [SSH (deploy keys)](#push-using-ssh-deploy-keys) to push the pull request branch. This is arguably more secure than using a PAT because deploy keys can be set per repository. However, this method will only trigger `on: push` workflows.
- Use a [machine account that creates pull requests from its own fork](#push-pull-request-branches-to-a-fork). This is the most secure because the PAT created only grants access to the machine account's fork, not the main repository. This method will trigger `on: pull_request` workflows to run. Workflows triggered `on: push` will not run because the push event is in the fork.
- Use a [GitHub App to generate a token](#authenticating-with-github-app-generated-tokens) that can be used with this action. GitHub App generated tokens are more secure than using a PAT because GitHub App access permissions can be set with finer granularity and are scoped to only repositories where the App is installed. This method will trigger both `on: push` and `on: pull_request` workflows.

### Security

From a security perspective it's good practice to fork third-party actions, review the code, and use your fork of the action in workflows.
By using third-party actions directly the risk exists that it could be modified to do something malicious, such as capturing secrets.

Alternatively, use the action directly and reference the commit hash for the version you want to target.
```
  - uses: thirdparty/foo-action@172ec762f2ac8e050062398456fccd30444f8f30
```

This action uses [ncc](https://github.com/zeit/ncc) to compile the Node.js code and dependencies into a single Javascript file under the [dist](https://github.com/peter-evans/create-pull-request/tree/master/dist) directory.

## Advanced usage

### Creating pull requests in a remote repository

Checking out a branch from a different repository from where the workflow is executing will make *that repository* the target for the created pull request. In this case, a `repo` scoped [Personal Access Token (PAT)](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line) is required.

```yml
      - uses: actions/checkout@v2
        with:
          token: ${{ secrets.PAT }}
          repository: owner/repo

      # Make changes to pull request here

      - uses: peter-evans/create-pull-request@v3
        with:
          token: ${{ secrets.PAT }}
```

### Push using SSH (deploy keys)

[Deploy keys](https://developer.github.com/v3/guides/managing-deploy-keys/#deploy-keys) can be set per repository and so are arguably more secure than using a `repo` scoped [Personal Access Token (PAT)](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).
Allowing the action to push with a configured deploy key will trigger `on: push` workflows. This makes it an alternative to using a PAT to trigger checks for pull requests.

How to use SSH (deploy keys) with create-pull-request action:

1. [Create a new SSH key pair](https://help.github.com/en/github/authenticating-to-github/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent#generating-a-new-ssh-key) for your repository. Do not set a passphrase.
2. Copy the contents of the public key (.pub file) to a new repository [deploy key](https://developer.github.com/v3/guides/managing-deploy-keys/#deploy-keys) and check the box to "Allow write access."
3. Add a secret to the repository containing the entire contents of the private key.
4. As shown in the example below, configure `actions/checkout` to use the deploy key you have created.

```yml
    steps:
      - uses: actions/checkout@v2
        with:
          ssh-key: ${{ secrets.SSH_PRIVATE_KEY }}

      # Make changes to pull request here

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
```

### Push pull request branches to a fork

Instead of pushing pull request branches to the repository you want to update, you can push them to a fork of that repository.
This allows you to employ the [principle of least privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege) by using a dedicated user acting as a [machine account](https://help.github.com/en/github/site-policy/github-terms-of-service#3-account-requirements).
This user has no access to the main repository.
It will use their own fork to push code and create the pull request.

1. Create a new GitHub user and login.
2. Fork the repository that you will be creating pull requests in.
3. Create a [Personal Access Token (PAT)](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).
4. Logout and log back in to your main user account.
5. Add a secret to your repository containing the above PAT.
6. As shown in the following example workflow, set the `push-to-fork` input to the full repository name of the fork.

```yaml
      - uses: actions/checkout@v2

      # Make changes to pull request here

      - uses: peter-evans/create-pull-request@v3
        with:
          token: ${{ secrets.MACHINE_USER_PAT }}
          push-to-fork: machine-user/fork-of-repository
```

### Authenticating with GitHub App generated tokens

A GitHub App can be created for the sole purpose of generating tokens for use with GitHub actions.
These tokens can be used in place of `GITHUB_TOKEN` or a [Personal Access Token (PAT)](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).
GitHub App generated tokens are more secure than using a PAT because GitHub App access permissions can be set with finer granularity and are scoped to only repositories where the App is installed.

1. Create a minimal [GitHub App](https://developer.github.com/apps/building-github-apps/creating-a-github-app/), setting the following fields:

    - Set `GitHub App name`.
    - Set `Homepage URL` to anything you like, such as your GitHub profile page.
    - Uncheck `Active` under `Webhook`. You do not need to enter a `Webhook URL`.
    - Under `Repository permissions: Contents` select `Access: Read & write`.
    - Under `Repository permissions: Pull requests` select `Access: Read & write`.

2. Create a Private key from the App settings page and store it securely.

3. Install the App on any repository where workflows will run requiring tokens.

4. Set secrets on your repository containing the GitHub App ID, and the private key you created in step 2. e.g. `APP_ID`, `APP_PRIVATE_KEY`.

5. The following example workflow shows how to use [tibdex/github-app-token](https://github.com/tibdex/github-app-token) to generate a token for use with this action.

```yaml
    steps:
      - uses: actions/checkout@v2

      - uses: tibdex/github-app-token@v1
        id: generate-token
        with:
          app_id: ${{ secrets.APP_ID }}
          private_key: ${{ secrets.APP_PRIVATE_KEY }}

      # Make changes to pull request here

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
          token: ${{ steps.generate-token.outputs.token }}
```

### Running in a container

This action can be run inside a container by installing the action's dependencies either in the Docker image itself, or during the workflow.

The action requires `git` to be installed and on the `PATH`.

Note that `actions/checkout` requires Git 2.18 or higher to be installed, otherwise it will just download the source of the repository instead of cloning it.

**Alpine container example:**
```yml
jobs:
  createPullRequestAlpine:
    runs-on: ubuntu-latest
    container:
      image: alpine
    steps:
      - name: Install dependencies
        run: apk --no-cache add git

      - uses: actions/checkout@v2

      # Make changes to pull request here

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
```

**Ubuntu container example:**
```yml
jobs:
  createPullRequestAlpine:
    runs-on: ubuntu-latest
    container:
      image: ubuntu
    steps:
      - name: Install dependencies
        run: |
          apt-get update
          apt-get install -y software-properties-common
          add-apt-repository -y ppa:git-core/ppa
          apt-get install -y git

      - uses: actions/checkout@v2

      # Make changes to pull request here

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
```

### Creating pull requests on tag push

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

      # Make changes to pull request here

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
        with:
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

      # Make changes to pull request here

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v3
```
