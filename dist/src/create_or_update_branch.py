#!/usr/bin/env python3
""" Create or Update Branch """
import common as cmn
from git import Repo, GitCommandError
import os


CHERRYPICK_EMPTY = (
    "The previous cherry-pick is now empty, possibly due to conflict resolution."
)


def fetch_successful(repo, repo_url, branch):
    try:
        repo.git.fetch(repo_url, f"{branch}:refs/remotes/origin/{branch}")
    except GitCommandError:
        return False
    return True


def is_ahead(repo, branch_1, branch_2):
    # Return true if branch_2 is ahead of branch_1
    return (
        int(repo.git.rev_list("--right-only", "--count", f"{branch_1}...{branch_2}"))
        > 0
    )


def is_behind(repo, branch_1, branch_2):
    # Return true if branch_2 is behind branch_1
    return (
        int(repo.git.rev_list("--left-only", "--count", f"{branch_1}...{branch_2}")) > 0
    )


def is_even(repo, branch_1, branch_2):
    # Return true if branch_2 is even with branch_1
    return not is_ahead(repo, branch_1, branch_2) and not is_behind(
        repo, branch_1, branch_2
    )


def has_diff(repo, branch_1, branch_2):
    diff = repo.git.diff(f"{branch_1}..{branch_2}")
    return len(diff) > 0


def create_or_update_branch(repo, repo_url, commit_message, base, branch):
    # Set the default return values
    action = "none"
    diff = False

    # Get the working base. This may or may not be the actual base.
    working_base = repo.git.symbolic_ref("HEAD", "--short")
    # If the base is not specified it is assumed to be the working base
    if base is None:
        base = working_base

    # Save the working base changes to a temporary branch
    temp_branch = cmn.get_random_string(length=20)
    repo.git.checkout("HEAD", b=temp_branch)
    # Commit any uncomitted changes
    if repo.is_dirty(untracked_files=True):
        print(f"Uncommitted changes found. Adding a commit.")
        repo.git.add("-A")
        repo.git.commit(m=commit_message)

    # Perform fetch and reset the working base
    # Commits made during the workflow will be removed
    repo.git.fetch("--force", repo_url, f"{working_base}:{working_base}")

    # If the working base is not the base, rebase the temp branch commits
    if working_base != base:
        print(
            f"Rebasing commits made to branch '{working_base}' on to base branch '{base}'"
        )
        # Checkout the actual base
        repo.git.fetch("--force", repo_url, f"{base}:{base}")
        repo.git.checkout(base)
        # Cherrypick commits from the temporary branch starting from the working base
        commits = repo.git.rev_list("--reverse", f"{working_base}..{temp_branch}", ".")
        for commit in commits.splitlines():
            try:
                repo.git.cherry_pick(
                    "--strategy",
                    "recursive",
                    "--strategy-option",
                    "theirs",
                    f"{commit}",
                )
            except GitCommandError as e:
                if CHERRYPICK_EMPTY not in e.stderr:
                    print("Unexpected error: ", e)
                    raise
        # Reset the temp branch to the working index
        repo.git.checkout("-B", temp_branch, "HEAD")
        # Reset the base
        repo.git.fetch("--force", repo_url, f"{base}:{base}")

    # Try to fetch the pull request branch
    if not fetch_successful(repo, repo_url, branch):
        # The pull request branch does not exist
        print(f"Pull request branch '{branch}' does not exist yet")
        # Create the pull request branch
        repo.git.checkout("HEAD", b=branch)
        # Check if the pull request branch is ahead of the base
        diff = is_ahead(repo, base, branch)
        if diff:
            action = "created"
            print(f"Created branch '{branch}'")
        else:
            print(
                f"Branch '{branch}' is not ahead of base '{base}' and will not be created"
            )
    else:
        # The pull request branch exists
        print(
            f"Pull request branch '{branch}' already exists as remote branch 'origin/{branch}'"
        )
        # Checkout the pull request branch
        repo.git.checkout(branch)

        if has_diff(repo, branch, temp_branch):
            # If the branch differs from the recreated temp version then the branch is reset
            # For changes on base this action is similar to a rebase of the pull request branch
            print(f"Resetting '{branch}'")
            repo.git.checkout("-B", branch, temp_branch)
            # repo.git.switch("-C", branch, temp_branch)

        # Check if the pull request branch has been updated
        # If the branch was reset or updated it will be ahead
        # It may be behind if a reset now results in no diff with the base
        if not is_even(repo, f"origin/{branch}", branch):
            action = "updated"
            print(f"Updated branch '{branch}'")
        else:
            print(
                f"Branch '{branch}' is even with its remote and will not be updated"
            )

        # Check if the pull request branch is ahead of the base
        diff = is_ahead(repo, base, branch)

    # Delete the temporary branch
    repo.git.branch("--delete", "--force", temp_branch)

    return {"action": action, "diff": diff, "base": base}
