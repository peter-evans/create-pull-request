const path = require("path");
const {
  getRepoPath,
  execGit,
  addConfigOption,
  unsetConfigOption,
  configOptionExists,
  getConfigOption,
  getAndUnsetConfigOption
} = require("./git");

test("getRepoPath", async () => {
  expect(getRepoPath()).toEqual(process.env["GITHUB_WORKSPACE"]);
  expect(getRepoPath("foo")).toEqual(
    path.resolve(process.env["GITHUB_WORKSPACE"], "foo")
  );
});

test("execGit", async () => {
  const repoPath = getRepoPath();
  const result = await execGit(
    repoPath,
    ["config", "--local", "--name-only", "--get-regexp", "remote.origin.url"],
    true
  );
  expect(result.exitCode).toEqual(0);
  expect(result.stdout.trim()).toEqual("remote.origin.url");
});

test("add and unset config option", async () => {
  const repoPath = getRepoPath();
  const add = await addConfigOption(repoPath, "test.add.and.unset.config.option", "true");
  expect(add).toBeTruthy();
  const unset = await unsetConfigOption(repoPath, "test.add.and.unset.config.option");
  expect(unset).toBeTruthy();
});

test("configOptionExists returns true", async () => {
  const repoPath = getRepoPath();
  const result = await configOptionExists(repoPath, "remote.origin.url");
  expect(result).toBeTruthy();
});

test("configOptionExists returns false", async () => {
  const repoPath = getRepoPath();
  const result = await configOptionExists(repoPath, "this.key.does.not.exist");
  expect(result).toBeFalsy();
});

test("get config option", async () => {
  const repoPath = getRepoPath();
  const add = await addConfigOption(repoPath, "test.get.config.option", "foo");
  expect(add).toBeTruthy();
  const get = await getConfigOption(repoPath, "test.get.config.option");
  expect(get).toEqual("foo");
  const unset = await unsetConfigOption(repoPath, "test.get.config.option");
  expect(unset).toBeTruthy();
});

test("get and unset config option is successful", async () => {
  const repoPath = getRepoPath();
  const add = await addConfigOption(repoPath, "test.get.and.unset.config.option", "foo");
  expect(add).toBeTruthy();
  const getAndUnset = await getAndUnsetConfigOption(repoPath, "test.get.and.unset.config.option");
  expect(getAndUnset).toEqual("foo");
});

test("get and unset config option is unsuccessful", async () => {
  const repoPath = getRepoPath();
  const getAndUnset = await getAndUnsetConfigOption(repoPath, "this.key.does.not.exist");
  expect(getAndUnset).toBeNull();
});
