#!/usr/bin/env python3
""" Test Common """
import common as cmn
import pytest


def test_get_random_string():
    assert len(cmn.get_random_string()) == 7
    assert len(cmn.get_random_string(length=20)) == 20


def test_parse_github_repository_success():
    protocol, repository = cmn.parse_github_repository(
        "https://github.com/peter-evans/create-pull-request"
    )
    assert protocol == "HTTPS"
    assert repository == "peter-evans/create-pull-request"

    protocol, repository = cmn.parse_github_repository(
        "https://xxx:x-oauth-basic@github.com/peter-evans/create-pull-request"
    )
    assert protocol == "HTTPS"
    assert repository == "peter-evans/create-pull-request"

    protocol, repository = cmn.parse_github_repository(
        "git@github.com:peter-evans/create-pull-request.git"
    )
    assert protocol == "SSH"
    assert repository == "peter-evans/create-pull-request"


def test_parse_github_repository_failure():
    url = "https://github.com/peter-evans"
    with pytest.raises(ValueError) as e_info:
        cmn.parse_github_repository(url)
    assert (
        e_info.value.args[0]
        == f"The format of '{url}' is not a valid GitHub repository URL"
    )


def test_parse_display_name_email_success():
    name, email = cmn.parse_display_name_email("abc def <abc@def.com>")
    assert name == "abc def"
    assert email == "abc@def.com"

    name, email = cmn.parse_display_name_email(
        "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>"
    )
    assert name == "github-actions[bot]"
    assert email == "41898282+github-actions[bot]@users.noreply.github.com"


def test_parse_display_name_email_failure():
    display_name_email = "abc@def.com"
    with pytest.raises(ValueError) as e_info:
        cmn.parse_display_name_email(display_name_email)
    assert (
        e_info.value.args[0]
        == f"The format of '{display_name_email}' is not a valid email address with display name"
    )

    display_name_email = " < >"
    with pytest.raises(ValueError) as e_info:
        cmn.parse_display_name_email(display_name_email)
    assert (
        e_info.value.args[0]
        == f"The format of '{display_name_email}' is not a valid email address with display name"
    )
