#!/usr/bin/env python3
""" Test Create or Update Branch """
import create_or_update_branch as coub
from git import Repo
import os
import pytest
import sys
import time


# Set git environment
author_name = "github-actions[bot]"
author_email = "41898282+github-actions[bot]@users.noreply.github.com"
committer_name = "GitHub"
committer_email = "noreply@github.com"
repo = Repo(os.getcwd())
repo.git.update_environment(
    GIT_AUTHOR_NAME=author_name,
    GIT_AUTHOR_EMAIL=author_email,
    GIT_COMMITTER_NAME=committer_name,
    GIT_COMMITTER_EMAIL=committer_email,
)

REPO_URL = repo.git.config("--get", "remote.origin.url")

TRACKED_FILE = "tracked-file.txt"
UNTRACKED_FILE = "untracked-file.txt"

DEFAULT_BRANCH = "tests/master"
NOT_BASE_BRANCH = "tests/branch-that-is-not-the-base"
NOT_EXIST_BRANCH = "tests/branch-that-does-not-exist"

COMMIT_MESSAGE = "[create-pull-request] automated change"
BRANCH = "tests/create-pull-request/patch"
BASE = DEFAULT_BRANCH


def create_tracked_change(content=None):
    if content is None:
        content = str(time.time())
    # Create a tracked file change
    with open(TRACKED_FILE, "w") as f:
        f.write(content)
    return content


def create_untracked_change(content=None):
    if content is None:
        content = str(time.time())
    # Create an untracked file change
    with open(UNTRACKED_FILE, "w") as f:
        f.write(content)
    return content


def get_tracked_content():
    # Read the content of the tracked file
    with open(TRACKED_FILE, "r") as f:
        return f.read()


def get_untracked_content():
    # Read the content of the untracked file
    with open(UNTRACKED_FILE, "r") as f:
        return f.read()


def create_changes(tracked_content=None, untracked_content=None):
    tracked_content = create_tracked_change(tracked_content)
    untracked_content = create_untracked_change(untracked_content)
    return tracked_content, untracked_content


def create_commits(number=2, final_tracked_content=None, final_untracked_content=None):
    for i in range(number):
        commit_number = i + 1
        if commit_number == number:
            tracked_content, untracked_content = create_changes(
                final_tracked_content, final_untracked_content
            )
        else:
            tracked_content, untracked_content = create_changes()
        repo.git.add("-A")
        repo.git.commit(m=f"Commit {commit_number}")
    return tracked_content, untracked_content


@pytest.fixture(scope="module", autouse=True)
def before_after_all():
    print("Before all tests")
    # Check there are no local changes that might be
    # destroyed by running these tests
    assert not repo.is_dirty(untracked_files=True)

    # Create a new default branch for the test run
    repo.remotes.origin.fetch()
    repo.git.checkout("master")
    repo.git.checkout("HEAD", b=NOT_BASE_BRANCH)
    create_tracked_change()
    repo.git.add("-A")
    repo.git.commit(m="This commit should not appear in pr branches")
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{NOT_BASE_BRANCH}")
    # Create a new default branch for the test run
    repo.git.checkout("master")
    repo.git.checkout("HEAD", b=DEFAULT_BRANCH)
    create_tracked_change()
    repo.git.add("-A")
    repo.git.commit(m="Add file to be a tracked file for tests")
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{DEFAULT_BRANCH}")

    yield

    print("After all tests")
    repo.git.checkout("master")
    # Delete the "not base branch" created for the test run
    repo.git.branch("--delete", "--force", NOT_BASE_BRANCH)
    repo.git.push("--delete", "--force", REPO_URL, f"refs/heads/{NOT_BASE_BRANCH}")
    # Delete the default branch created for the test run
    repo.git.branch("--delete", "--force", DEFAULT_BRANCH)
    repo.git.push("--delete", "--force", REPO_URL, f"refs/heads/{DEFAULT_BRANCH}")


def before_test():
    print("Before test")
    # Checkout the default branch
    repo.git.checkout(DEFAULT_BRANCH)


def after_test(delete_remote=True):
    print("After test")
    # Output git log
    print(repo.git.log("-5", pretty="oneline"))
    # Delete the pull request branch if it exists
    repo.git.checkout(DEFAULT_BRANCH)
    print(f"Deleting {BRANCH}")
    for branch in repo.branches:
        if branch.name == BRANCH:
            repo.git.branch("--delete", "--force", BRANCH)
            break
    if delete_remote:
        print(f"Deleting origin/{BRANCH}")
        for ref in repo.remotes.origin.refs:
            if ref.name == f"origin/{BRANCH}":
                repo.git.push("--delete", "--force", REPO_URL, f"refs/heads/{BRANCH}")
                repo.remotes.origin.fetch("--prune")
                break


@pytest.fixture(autouse=True)
def before_after_tests():
    before_test()
    yield
    after_test()


# Tests if a branch exists and can be fetched
def coub_fetch_successful():
    assert coub.fetch_successful(repo, REPO_URL, NOT_BASE_BRANCH)
    assert not coub.fetch_successful(repo, REPO_URL, NOT_EXIST_BRANCH)


# Tests no changes resulting in no new branch being created
def coub_no_changes_on_create():
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "none"


# Tests create and update with a tracked file change
def coub_tracked_changes():
    # Create a tracked file change
    tracked_content = create_tracked_change()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create a tracked file change
    tracked_content = create_tracked_change()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content


# Tests create and update with an untracked file change
def coub_untracked_changes():
    # Create an untracked file change
    untracked_content = create_untracked_change()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create an untracked file change
    untracked_content = create_untracked_change()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_untracked_content() == untracked_content


# Tests create and update with identical changes
# The pull request branch will not be updated
def coub_identical_changes():
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create identical tracked and untracked file changes
    create_changes(tracked_content, untracked_content)
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "none"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Tests create and update with commits on the base inbetween
def coub_commits_on_base():
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create commits on the base
    create_commits()
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{DEFAULT_BRANCH}")
    repo.remotes.origin.fetch()

    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Tests create and then an update with no changes
# This effectively reverts the branch back to match the base and results in no diff
def coub_changes_no_diff():
    # Save the default branch tracked content
    default_tracked_content = get_tracked_content()

    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Running with no update effectively reverts the branch back to match the base
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"] == False
    assert get_tracked_content() == default_tracked_content


# Tests create and update with commits on the base inbetween
# The changes on base effectively revert the branch back to match the base and results in no diff
def coub_commits_on_base_no_diff():
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create commits on the base
    tracked_content, untracked_content = create_commits()
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{DEFAULT_BRANCH}")
    repo.remotes.origin.fetch()

    # Create the same tracked and untracked file changes that were made to the base
    create_changes(tracked_content, untracked_content)
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"] == False
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Tests create and update with commits on the working base (during the workflow)
def coub_commits_on_working_base():
    # Create commits on the working base
    tracked_content, untracked_content = create_commits()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create commits on the working base
    tracked_content, untracked_content = create_commits()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Tests create and update with changes and commits on the working base (during the workflow)
def coub_changes_and_commits_on_working_base():
    # Create commits on the working base
    create_commits()
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create commits on the working base
    create_commits()
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Tests create and update with changes and commits on the working base (during the workflow)
# with commits on the base inbetween
def coub_changes_and_commits_on_base_and_working_base():
    # Create commits on the working base
    create_commits()
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create commits on the base
    create_commits()
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{DEFAULT_BRANCH}")
    repo.remotes.origin.fetch()

    # Create commits on the working base
    create_commits()
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, None, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Working Base is Not Base (WBNB)
# Tests no changes resulting in no new branch being created
def coub_wbnb_no_changes_on_create():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "none"


# Working Base is Not Base (WBNB)
# Tests create and update with a tracked file change
def coub_wbnb_tracked_changes():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create a tracked file change
    tracked_content = create_tracked_change()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create a tracked file change
    tracked_content = create_tracked_change()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content


# Working Base is Not Base (WBNB)
# Tests create and update with an untracked file change
def coub_wbnb_untracked_changes():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create an untracked file change
    untracked_content = create_untracked_change()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create an untracked file change
    untracked_content = create_untracked_change()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_untracked_content() == untracked_content


# Working Base is Not Base (WBNB)
# Tests create and update with identical changes
# The pull request branch will not be updated
def coub_wbnb_identical_changes():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create identical tracked and untracked file changes
    create_changes(tracked_content, untracked_content)
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "none"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Working Base is Not Base (WBNB)
# Tests create and update with commits on the base inbetween
def coub_wbnb_commits_on_base():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create commits on the base
    create_commits()
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{DEFAULT_BRANCH}")
    repo.remotes.origin.fetch()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Working Base is Not Base (WBNB)
# Tests create and then an update with no changes
# This effectively reverts the branch back to match the base and results in no diff
def coub_wbnb_changes_no_diff():
    # Save the default branch tracked content
    default_tracked_content = get_tracked_content()
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Running with no update effectively reverts the branch back to match the base
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"] == False
    assert get_tracked_content() == default_tracked_content


# Working Base is Not Base (WBNB)
# Tests create and update with commits on the base inbetween
# The changes on base effectively revert the branch back to match the base and results in no diff
# This scenario will cause cherrypick to fail due to an empty commit.
# The commit is empty because the changes now exist on the base.
def coub_wbnb_commits_on_base_no_diff():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create commits on the base
    tracked_content, untracked_content = create_commits()
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{DEFAULT_BRANCH}")
    repo.remotes.origin.fetch()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create the same tracked and untracked file changes that were made to the base
    create_changes(tracked_content, untracked_content)
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"] == False
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Working Base is Not Base (WBNB)
# Tests create and update with commits on the working base (during the workflow)
def coub_wbnb_commits_on_working_base():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create commits on the working base
    tracked_content, untracked_content = create_commits()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create commits on the working base
    tracked_content, untracked_content = create_commits()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Working Base is Not Base (WBNB)
# Tests create and update with changes and commits on the working base (during the workflow)
def coub_wbnb_changes_and_commits_on_working_base():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create commits on the working base
    create_commits()
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create commits on the working base
    create_commits()
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# Working Base is Not Base (WBNB)
# Tests create and update with changes and commits on the working base (during the workflow)
# with commits on the base inbetween
def coub_wbnb_changes_and_commits_on_base_and_working_base():
    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create commits on the working base
    create_commits()
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "created"
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content

    # Push pull request branch to remote
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{BRANCH}")
    repo.remotes.origin.fetch()

    after_test(delete_remote=False)
    before_test()

    # Create commits on the base
    create_commits()
    repo.git.push("--force", REPO_URL, f"HEAD:refs/heads/{DEFAULT_BRANCH}")
    repo.remotes.origin.fetch()

    # Set the working base to a branch that is not the pull request base
    repo.git.checkout(NOT_BASE_BRANCH)
    # Create commits on the working base
    create_commits()
    # Create tracked and untracked file changes
    tracked_content, untracked_content = create_changes()
    result = coub.create_or_update_branch(repo, REPO_URL, COMMIT_MESSAGE, BASE, BRANCH)
    assert result["action"] == "updated"
    assert result["diff"]
    assert get_tracked_content() == tracked_content
    assert get_untracked_content() == untracked_content


# pytest -v -s ~/git/create-pull-request/src

test_coub_fetch_successful = coub_fetch_successful

test_coub_no_changes_on_create = coub_no_changes_on_create
test_coub_tracked_changes = coub_tracked_changes
test_coub_untracked_changes = coub_untracked_changes
test_coub_identical_changes = coub_identical_changes
test_coub_commits_on_base = coub_commits_on_base

test_coub_changes_no_diff = coub_changes_no_diff
test_coub_commits_on_base_no_diff = coub_commits_on_base_no_diff

test_coub_commits_on_working_base = coub_commits_on_working_base
test_coub_changes_and_commits_on_working_base = coub_changes_and_commits_on_working_base
test_coub_changes_and_commits_on_base_and_working_base = (
    coub_changes_and_commits_on_base_and_working_base
)

# WBNB
test_coub_wbnb_no_changes_on_create = coub_wbnb_no_changes_on_create
test_coub_wbnb_tracked_changes = coub_wbnb_tracked_changes
test_coub_wbnb_untracked_changes = coub_wbnb_untracked_changes
test_coub_wbnb_identical_changes = coub_wbnb_identical_changes
test_coub_wbnb_commits_on_base = coub_wbnb_commits_on_base

test_coub_wbnb_changes_no_diff = coub_wbnb_changes_no_diff
test_coub_wbnb_commits_on_base_no_diff = coub_wbnb_commits_on_base_no_diff

test_coub_wbnb_commits_on_working_base = coub_wbnb_commits_on_working_base
test_coub_wbnb_changes_and_commits_on_working_base = (
    coub_wbnb_changes_and_commits_on_working_base
)
test_coub_wbnb_changes_and_commits_on_base_and_working_base = (
    coub_wbnb_changes_and_commits_on_base_and_working_base
)
