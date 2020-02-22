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

async function unsetConfigOption(repoPath, name) {
  const result = await execGit(
    repoPath,
    ["config", "--local", "--unset", name],
    true
  );
  return result.exitCode === 0;
}

async function configOptionExists(repoPath, name) {
  const result = await execGit(
    repoPath,
    ["config", "--local", "--name-only", "--get-regexp", name],
    true
  );
  return result.exitCode === 0;
}

async function getConfigOption(repoPath, name) {
  const result = await execGit(
    repoPath,
    ["config", "--local", name],
    true
  );
  return result.stdout.trim();
}

async function getAndUnsetConfigOption(repoPath, name) {
  if (await configOptionExists(repoPath, name)) {
    const extraHeaderOptionValue = await getConfigOption(repoPath, name);
    if (await unsetConfigOption(repoPath, name)) {
      core.debug(`Unset config option '${name}'`);
      return extraHeaderOptionValue;
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
