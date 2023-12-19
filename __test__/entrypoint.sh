#!/bin/sh -l
set -euo pipefail

# Save the working directory
WORKINGDIR=$PWD

# Create and serve a remote repo
mkdir -p /git/remote/repos
git config --global init.defaultBranch main
git init --bare /git/remote/repos/test-base.git
git daemon --verbose --enable=receive-pack --base-path=/git/remote --export-all /git/remote &>/dev/null &

# Give the daemon time to start
sleep 2

# Create a local clone and make an initial commit
mkdir -p /git/local/repos
git clone git://127.0.0.1/repos/test-base.git /git/local/repos/test-base
cd /git/local/repos/test-base
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
echo "#test-base" > README.md
git add .
git commit -m "initial commit"
git push -u
git log -1 --pretty=oneline
git config --global --unset user.email
git config --global --unset user.name
git config -l

# Clone a server-side fork of the base repo
cd $WORKINGDIR
git clone --mirror git://127.0.0.1/repos/test-base.git /git/remote/repos/test-fork.git
cd /git/remote/repos/test-fork.git
git log -1 --pretty=oneline

# Restore the working directory
cd $WORKINGDIR

# Execute integration tests
jest int --runInBand
