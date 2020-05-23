#!/bin/sh -l
set -euo pipefail

# Save the working directory
WORKINGDIR=$PWD

# Serve remote repo
mkdir /git
git init --bare /git/test-repo.git
git daemon --verbose --enable=receive-pack --base-path=/git --export-all /git/test-repo.git &>/dev/null &

# Give the daemon time to start
sleep 2

# Clone and make an initial commit
git clone git://127.0.0.1/test-repo.git /git/test-repo
cd /git/test-repo
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
echo "#test-repo" > README.md
git add .
git commit -m "initial commit"
git push -u

# Restore the working directory
cd $WORKINGDIR

# Execute integration tests
jest int
