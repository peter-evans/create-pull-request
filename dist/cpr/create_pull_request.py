#!/usr/bin/env python3
""" Create Pull Request """
import base64
import common as cmn
import create_or_update_branch as coub
import create_or_update_pull_request as coupr
from git import Repo, GitCommandError
import json
import os
import sys
import time


# Default the committer and author to the GitHub Actions bot
DEFAULT_COMMITTER = "GitHub <noreply@github.com>"
DEFAULT_AUTHOR = (
    "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>"
)
DEFAULT_COMMIT_MESSAGE = "[create-pull-request] automated change"
DEFAULT_TITLE = "Changes by create-pull-request action"
DEFAULT_BODY = (
    "Automated changes by "
    + "[create-pull-request](https://github.com/peter-evans/create-pull-request) GitHub action"
)
DEFAULT_BRANCH = "create-pull-request/patch"


def get_git_config_value(repo, name):
    try:
        return repo.git.config("--get", name)
    except GitCommandError:
        return None


def get_repository_detail(repo):
    remote_origin_url = get_git_config_value(repo, "remote.origin.url")
    if remote_origin_url is None:
        raise ValueError("Failed to fetch 'remote.origin.url' from git config")
    protocol, github_repository = cmn.parse_github_repository(remote_origin_url)
    return remote_origin_url, protocol, github_repository


def git_user_config_is_set(repo):
    name = get_git_config_value(repo, "user.name")
    email = get_git_config_value(repo, "user.email")

    if name is not None and email is not None:
        print(f"Git user already configured as '{name} <{email}>'")
        return True

    committer_name = get_git_config_value(repo, "committer.name")
    committer_email = get_git_config_value(repo, "committer.email")
    author_name = get_git_config_value(repo, "author.name")
    author_email = get_git_config_value(repo, "author.email")

    if (
        committer_name is not None
        and committer_email is not None
        and author_name is not None
        and author_email is not None
    ):
        print(
            f"Git committer already configured as '{committer_name} <{committer_email}>'"
        )
        print(f"Git author already configured as '{author_name} <{author_email}>'")
        return True

    return False


def set_committer_author(repo, committer, author):
    # If either committer or author is supplied they will be cross used
    if committer is None and author is not None:
        print("Supplied author will also be used as the committer.")
        committer = author
    if author is None and committer is not None:
        print("Supplied committer will also be used as the author.")
        author = committer

    # If no committer/author has been supplied but user configuration already
    # exists in git config we can exit and use the existing config as-is.
    if committer is None and author is None:
        if git_user_config_is_set(repo):
            return

    # Set defaults if no committer/author has been supplied
    if committer is None and author is None:
        committer = DEFAULT_COMMITTER
        author = DEFAULT_AUTHOR

    # Set git environment. This will not persist after the action completes.
    committer_name, committer_email = cmn.parse_display_name_email(committer)
    author_name, author_email = cmn.parse_display_name_email(author)
    repo.git.update_environment(
        GIT_COMMITTER_NAME=committer_name,
        GIT_COMMITTER_EMAIL=committer_email,
        GIT_AUTHOR_NAME=author_name,
        GIT_AUTHOR_EMAIL=author_email,
    )
    print(f"Configured git committer as '{committer_name} <{committer_email}>'")
    print(f"Configured git author as '{author_name} <{author_email}>'")


# Get required environment variables
github_token = os.environ["GITHUB_TOKEN"]
# Get environment variables with defaults
path = os.getenv("CPR_PATH", os.getcwd())
branch = os.getenv("CPR_BRANCH", DEFAULT_BRANCH)
commit_message = os.getenv("CPR_COMMIT_MESSAGE", DEFAULT_COMMIT_MESSAGE)
# Get environment variables with a default of 'None'
committer = os.environ.get("CPR_COMMITTER")
author = os.environ.get("CPR_AUTHOR")
base = os.environ.get("CPR_BASE")

# Set the repo path
repo = Repo(path)

# Determine the GitHub repository from git config
# This will be the target repository for the pull request
repo_url, protocol, github_repository = get_repository_detail(repo)
print(f"Target repository set to {github_repository}")

if protocol == "HTTPS":
    print(f"::debug::Using HTTPS protocol")
    # Encode and configure the basic credential for HTTPS access
    basic_credential = base64.b64encode(
        f"x-access-token:{github_token}".encode("utf-8")
    ).decode("utf-8")
    # Mask the basic credential in logs and debug output
    print(f"::add-mask::{basic_credential}")
    repo.git.set_persistent_git_options(
        c=f"http.https://github.com/.extraheader=AUTHORIZATION: basic {basic_credential}"
    )

# Determine if the checked out ref is a valid base for a pull request
# The action needs the checked out HEAD ref to be a branch
# This check will fail in the following cases:
# - HEAD is detached
# - HEAD is a merge commit (pull_request events)
# - HEAD is a tag
try:
    working_base = repo.git.symbolic_ref("HEAD", "--short")
except GitCommandError as e:
    print(f"::debug::{e.stderr}")
    print(
        f"::error::The checked out ref is not a valid base for a pull request. "
        + "Unable to continue. Exiting."
    )
    sys.exit(1)

# Exit if the working base is a PR branch created by this action.
# This may occur when using a PAT instead of GITHUB_TOKEN because
# a PAT allows workflow actions to trigger further events.
if working_base.startswith(branch):
    print(
        f"::error::Working base branch '{working_base}' was created by this action. "
        + "Unable to continue. Exiting."
    )
    sys.exit(1)

# Fetch an optional environment variable to determine the branch suffix
branch_suffix = os.environ.get("CPR_BRANCH_SUFFIX")
if branch_suffix is not None:
    if branch_suffix == "short-commit-hash":
        # Suffix with the short SHA1 hash
        branch = "{}-{}".format(branch, repo.git.rev_parse("--short", "HEAD"))
    elif branch_suffix == "timestamp":
        # Suffix with the current timestamp
        branch = "{}-{}".format(branch, int(time.time()))
    elif branch_suffix == "random":
        # Suffix with a 7 character random string
        branch = "{}-{}".format(branch, cmn.get_random_string())
    else:
        print(
            f"::error::Branch suffix '{branch_suffix}' is not a valid value. "
            + "Unable to continue. Exiting."
        )
        sys.exit(1)

# Output head branch
print(f"Pull request branch to create or update set to '{branch}'")

# Set the committer and author
try:
    set_committer_author(repo, committer, author)
except ValueError as e:
    print(f"::error::{e} " + "Unable to continue. Exiting.")
    sys.exit(1)

# Create or update the pull request branch
result = coub.create_or_update_branch(repo, repo_url, commit_message, base, branch)

if result["action"] in ["created", "updated"]:
    # The branch was created or updated
    print(f"Pushing pull request branch to 'origin/{branch}'")
    repo.git.push("--force", repo_url, f"HEAD:refs/heads/{branch}")

    # Set the base. It would have been 'None' if not specified as an input
    base = result["base"]

    # If there is no longer a diff with the base delete the branch and exit
    if not result["diff"]:
        print(f"Branch '{branch}' no longer differs from base branch '{base}'")
        print(f"Closing pull request and deleting branch '{branch}'")
        repo.git.push("--delete", "--force", repo_url, f"refs/heads/{branch}")
        sys.exit()

    # Fetch optional environment variables with default values
    title = os.getenv("CPR_TITLE", DEFAULT_TITLE)
    body = os.getenv("CPR_BODY", DEFAULT_BODY)

    # Create or update the pull request
    coupr.create_or_update_pull_request(
        github_token,
        github_repository,
        branch,
        base,
        title,
        body,
        os.environ.get("CPR_LABELS"),
        os.environ.get("CPR_ASSIGNEES"),
        os.environ.get("CPR_MILESTONE"),
        os.environ.get("CPR_REVIEWERS"),
        os.environ.get("CPR_TEAM_REVIEWERS"),
        os.environ.get("CPR_PROJECT_NAME"),
        os.environ.get("CPR_PROJECT_COLUMN_NAME"),
        os.environ.get("CPR_REQUEST_TO_PARENT"),
    )
