#!/usr/bin/env python3
import random
import re
import string


def get_random_string(length=7, chars=string.ascii_lowercase + string.digits):
    return "".join(random.choice(chars) for _ in range(length))


def parse_github_repository(url):
    # Parse the protocol and github repository from a URL
    # e.g. HTTPS, peter-evans/create-pull-request
    https_pattern = re.compile(r"^https://github.com/(.+/.+)$")
    ssh_pattern = re.compile(r"^git@github.com:(.+/.+).git$")

    match = https_pattern.match(url)
    if match is not None:
        return "HTTPS", match.group(1)

    match = ssh_pattern.match(url)
    if match is not None:
        return "SSH", match.group(1)

    raise ValueError(f"The format of '{url}' is not a valid GitHub repository URL")


def parse_display_name_email(display_name_email):
    # Parse the name and email address from a string in the following format
    # Display Name <email@address.com>
    pattern = re.compile(r"^([^<]+)\s*<([^>]+)>$")

    # Check we have a match
    match = pattern.match(display_name_email)
    if match is None:
        raise ValueError(
            f"The format of '{display_name_email}' is not a valid email address with display name"
        )

    # Check that name and email are not just whitespace
    name = match.group(1).strip()
    email = match.group(2).strip()
    if len(name) == 0 or len(email) == 0:
        raise ValueError(
            f"The format of '{display_name_email}' is not a valid email address with display name"
        )

    return name, email
