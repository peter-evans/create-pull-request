#!/usr/bin/env python3
""" Create or Update Pull Request """
from github import Github, GithubException
import os


def string_to_bool(str):
    if str is None:
        return False
    else:
        return str.lower() in [
            "true",
            "1",
            "t",
            "y",
            "yes",
            "on",
        ]


def cs_string_to_list(str):
    # Split the comma separated string into a list
    l = [i.strip() for i in str.split(",")]
    # Remove empty strings
    return list(filter(None, l))


def create_project_card(github_repo, project_name, project_column_name, pull_request):
    # Locate the project by name
    project = None
    for project_item in github_repo.get_projects("all"):
        if project_item.name == project_name:
            project = project_item
            break

    if not project:
        print("::error::Project not found. Unable to create project card.")
        return

    # Locate the column by name
    column = None
    for column_item in project.get_columns():
        if column_item.name == project_column_name:
            column = column_item
            break

    if not column:
        print("::error::Project column not found. Unable to create project card.")
        return

    # Create a project card for the pull request
    column.create_card(content_id=pull_request.id, content_type="PullRequest")
    print(
        "Added pull request #%d to project '%s' under column '%s'"
        % (pull_request.number, project.name, column.name)
    )


def create_or_update_pull_request(
    github_token,
    github_repository,
    branch,
    base,
    title,
    body,
    labels,
    assignees,
    milestone,
    reviewers,
    team_reviewers,
    project_name,
    project_column_name,
    draft,
    request_to_parent,
):
    github_repo = head_repo = Github(github_token).get_repo(github_repository)
    if string_to_bool(request_to_parent):
        github_repo = github_repo.parent
        if github_repo is None:
            raise ValueError(
                "The checked out repository is not a fork. Input 'request-to-parent' should be set to false."
            )

    head_branch = f"{head_repo.owner.login}:{branch}"

    # Create the pull request
    try:
        pull_request = github_repo.create_pull(
            title=title,
            body=body,
            base=base,
            head=head_branch,
            draft=string_to_bool(draft),
        )
        print(
            f"Created pull request #{pull_request.number} ({head_branch} => {github_repo.owner.login}:{base})"
        )
    except GithubException as e:
        if e.status == 422:
            # A pull request exists for this branch and base
            # Get the pull request
            pull_request = github_repo.get_pulls(
                state="open", base=base, head=head_branch
            )[0]
            # Update title and body
            pull_request.as_issue().edit(title=title, body=body)
            print(
                f"Updated pull request #{pull_request.number} ({head_branch} => {github_repo.owner.login}:{base})"
            )
        else:
            print(str(e))
            raise

    # Set the output variables
    os.system(f"echo ::set-env name=PULL_REQUEST_NUMBER::{pull_request.number}")
    os.system(f"echo ::set-output name=pull-request-number::{pull_request.number}")
    # 'pr_number' is deprecated
    os.system(f"echo ::set-output name=pr_number::{pull_request.number}")

    # Set labels, assignees and milestone
    if labels is not None:
        print(f"Applying labels '{labels}'")
        pull_request.as_issue().edit(labels=cs_string_to_list(labels))
    if assignees is not None:
        print(f"Applying assignees '{assignees}'")
        pull_request.as_issue().edit(assignees=cs_string_to_list(assignees))
    if milestone is not None:
        print(f"Applying milestone '{milestone}'")
        milestone = github_repo.get_milestone(int(milestone))
        pull_request.as_issue().edit(milestone=milestone)

    # Set pull request reviewers
    if reviewers is not None:
        print(f"Requesting reviewers '{reviewers}'")
        try:
            pull_request.create_review_request(reviewers=cs_string_to_list(reviewers))
        except GithubException as e:
            # Likely caused by "Review cannot be requested from pull request author."
            if e.status == 422:
                print("Request reviewers failed - {}".format(e.data["message"]))

    # Set pull request team reviewers
    if team_reviewers is not None:
        print(f"Requesting team reviewers '{team_reviewers}'")
        pull_request.create_review_request(
            team_reviewers=cs_string_to_list(team_reviewers)
        )

    # Create a project card for the pull request
    if project_name is not None and project_column_name is not None:
        try:
            create_project_card(
                github_repo, project_name, project_column_name, pull_request
            )
        except GithubException as e:
            # Likely caused by "Project already has the associated issue."
            if e.status == 422:
                print(
                    "Create project card failed - {}".format(
                        e.data["errors"][0]["message"]
                    )
                )
