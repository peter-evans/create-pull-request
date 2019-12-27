#!/usr/bin/env python3
""" Create Pull Request """
import common as cmn
import create_or_update_branch as coub
import create_or_update_pull_request as coupr
from git import Repo
import json
import os
import sys
import time


# Default the committer and author to the GitHub Actions bot
DEFAULT_COMMITTER = "GitHub <noreply@github.com>"
DEFAULT_AUTHOR = (
    "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>"
)


def set_committer_author(repo, committer, author):
    # When the user intends for the committer and author to be the same,
    # ideally, just the committer should be supplied. When just the author
    # is supplied, the same user intention is assumed.
    if committer is None and author is not None:
        print("Supplied author will also be used as the committer.")
        committer = author

    # TODO Get committer and author from git config
    # If just a committer exists, only set committer
    # If just author exists also use for the committer

    # Set defaults if no committer/author has been supplied
    if committer is None and author is None:
        committer = DEFAULT_COMMITTER
        author = DEFAULT_AUTHOR

    # Set git environment. This will not persist after the action completes.
    committer_name, committer_email = cmn.parse_display_name_email(committer)
    print(f"Configuring git committer as '{committer_name} <{committer_email}>'")
    if author is not None:
        author_name, author_email = cmn.parse_display_name_email(author)
        print(f"Configuring git author as '{author_name} <{author_email}>'")
        repo.git.update_environment(
            GIT_COMMITTER_NAME=committer_name,
            GIT_COMMITTER_EMAIL=committer_email,
            GIT_AUTHOR_NAME=author_name,
            GIT_AUTHOR_EMAIL=author_email,
        )
    else:
        repo.git.update_environment(
            GIT_COMMITTER_NAME=committer_name, GIT_COMMITTER_EMAIL=committer_email,
        )


# Get required environment variables
github_token = os.environ["GITHUB_TOKEN"]
github_repository = os.environ["GITHUB_REPOSITORY"]
# Get environment variables with defaults
branch = os.getenv("CPR_BRANCH", "create-pull-request/patch")
commit_message = os.getenv(
    "CPR_COMMIT_MESSAGE", "Changes by create-pull-request action"
)
# Get environment variables with a default of 'None'
committer = os.environ.get("CPR_COMMITTER")
author = os.environ.get("CPR_AUTHOR")
base = os.environ.get("CPR_BASE")

# Set the repo to the working directory
repo = Repo(os.getcwd())

# Determine if the checked out ref is a valid base for a pull request
# The action needs the checked out HEAD ref to be a branch
# This check will fail in the following cases:
# - HEAD is detached
# - HEAD is a merge commit (pull_request events)
# - HEAD is a tag
try:
    working_base = repo.git.symbolic_ref("HEAD", "--short")
except:
    print(f"::debug::{working_base}")
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

# Set the repository URL
repo_url = f"https://x-access-token:{github_token}@github.com/{github_repository}"

# Create or update the pull request branch
result = coub.create_or_update_branch(repo, repo_url, commit_message, base, branch)

if result["action"] in ["created", "updated"]:
    # The branch was created or updated
    print(f"Pushing pull request branch to 'origin/{branch}'")
    repo.git.push("--force", repo_url, f"HEAD:refs/heads/{branch}")

    # Set the base. It would have been 'None' if not specified as an input
    base = result["base"]

    # TODO Figure out what to do when there is no diff with the base anymore
    # if not result["diff"]:

    # Fetch optional environment variables with default values
    title = os.getenv("CPR_TITLE", "Auto-generated by create-pull-request action")
    body = os.getenv(
        "CPR_BODY",
        "Auto-generated pull request by "
        "[create-pull-request](https://github.com/peter-evans/create-pull-request) GitHub Action",
    )

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
    )
