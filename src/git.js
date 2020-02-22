const core = require("@actions/core");
const exec = require("@actions/exec");
const path = require("path");

function getRepoPath(relativePath) {
  let githubWorkspacePath = process.env["GITHUB_WORKSPACE"];
  if (!githubWorkspacePath) {
    throw new Error("GITHUB_WORKSPACE not defined");
  }
  githubWorkspacePath = path.resolve(githubWorkspacePath);
  core.debug(`githubWorkspacePath: ${githubWorkspacePath}`);

  repoPath = githubWorkspacePath;
  if (relativePath) repoPath = path.resolve(repoPath, relativePath);

  core.debug(`repoPath: ${repoPath}`);
  return repoPath;
}

async function execGit(repoPath, args, ignoreReturnCode = false) {
  const stdout = [];
  const options = {
    cwd: repoPath,
    ignoreReturnCode: ignoreReturnCode,
    listeners: {
      stdout: data => {
        stdout.push(data.toString());
      }
    }
  };

  var result = {};
  result.exitCode = await exec.exec("git", args, options);
  result.stdout = stdout.join("");
  return result;
}

async function addConfigOption(repoPath, name, value) {
  const result = await execGit(
    repoPath,
    ["config", "--local", "--add", name, value],
    true
  );
  return result.exitCode === 0;
}

async function unsetConfigOption(repoPath, name, valueRegex=".") {
  const result = await execGit(
    repoPath,
    ["config", "--local", "--unset", name, valueRegex],
    true
  );
  return result.exitCode === 0;
}

async function configOptionExists(repoPath, name, valueRegex=".") {
  const result = await execGit(
    repoPath,
    ["config", "--local", "--name-only", "--get-regexp", name, valueRegex],
    true
  );
  return result.exitCode === 0;
}

async function getConfigOption(repoPath, name, valueRegex=".") {
  const result = await execGit(
    repoPath,
    ["config", "--local", "--get-regexp", name, valueRegex],
    true
  );
  const option = result.stdout.trim().split(`${name} `);
  return {
    name: name,
    value: option[1]
  }
}

async function getAndUnsetConfigOption(repoPath, name, valueRegex=".") {
  if (await configOptionExists(repoPath, name, valueRegex)) {
    const option = await getConfigOption(repoPath, name, valueRegex);
    if (await unsetConfigOption(repoPath, name, valueRegex)) {
      core.debug(`Unset config option '${name}'`);
      return option;
    }
  }
  return null;
}

module.exports = {
  getRepoPath,
  execGit,
  addConfigOption,
  unsetConfigOption,
  configOptionExists,
  getConfigOption,
  getAndUnsetConfigOption
};
