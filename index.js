const { inspect } = require("util");
const core = require("@actions/core");
const exec = require("@actions/exec");
const setupPython = require("./src/setup-python");

async function run() {
  try {
    // Allows ncc to find assets to be included in the distribution
    const src = __dirname + "/src";
    core.debug(`src: ${src}`);

    // Setup Python from the tool cache
    setupPython("3.8.x", "x64");

    // Install requirements
    await exec.exec("pip", [
      "install",
      "--requirement",
      `${src}/requirements.txt`,
      "--no-index",
      `--find-links=${__dirname}/vendor`
    ]);

    // Fetch action inputs
    const inputs = {
      token: core.getInput("token"),
      path: core.getInput("path"),
      repository: core.getInput("repository"),
      commitMessage: core.getInput("commit-message"),
      committer: core.getInput("committer"),
      author: core.getInput("author"),
      title: core.getInput("title"),
      body: core.getInput("body"),
      labels: core.getInput("labels"),
      assignees: core.getInput("assignees"),
      reviewers: core.getInput("reviewers"),
      teamReviewers: core.getInput("team-reviewers"),
      milestone: core.getInput("milestone"),
      project: core.getInput("project"),
      projectColumn: core.getInput("project-column"),
      branch: core.getInput("branch"),
      base: core.getInput("base"),
      branchSuffix: core.getInput("branch-suffix"),
    };
    core.debug(`Inputs: ${inspect(inputs)}`);

    // Set environment variables from inputs.
    if (inputs.token) process.env.GITHUB_TOKEN = inputs.token;
    if (inputs.repository) process.env.CPR_REPOSITORY = inputs.repository;
    if (inputs.path) process.env.CPR_PATH = inputs.path;
    if (inputs.commitMessage) process.env.CPR_COMMIT_MESSAGE = inputs.commitMessage;
    if (inputs.committer) process.env.CPR_COMMITTER = inputs.committer;
    if (inputs.author) process.env.CPR_AUTHOR = inputs.author;
    if (inputs.title) process.env.CPR_TITLE = inputs.title;
    if (inputs.body) process.env.CPR_BODY = inputs.body;
    if (inputs.labels) process.env.CPR_LABELS = inputs.labels;
    if (inputs.assignees) process.env.CPR_ASSIGNEES = inputs.assignees;
    if (inputs.reviewers) process.env.CPR_REVIEWERS = inputs.reviewers;
    if (inputs.teamReviewers) process.env.CPR_TEAM_REVIEWERS = inputs.teamReviewers;
    if (inputs.milestone) process.env.CPR_MILESTONE = inputs.milestone;
    if (inputs.project) process.env.CPR_PROJECT_NAME = inputs.project;
    if (inputs.projectColumn) process.env.CPR_PROJECT_COLUMN_NAME = inputs.projectColumn;
    if (inputs.branch) process.env.CPR_BRANCH = inputs.branch;
    if (inputs.base) process.env.CPR_BASE = inputs.base;
    if (inputs.branchSuffix) process.env.CPR_BRANCH_SUFFIX = inputs.branchSuffix;

    // Execute python script
    await exec.exec("python", [`${src}/create_pull_request.py`]);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
