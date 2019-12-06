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
    setupPython("3.8.0", "x64");

    // Install requirements
    await exec.exec("pip", [
      "install",
      "--requirement",
      `${src}/requirements.txt`
    ]);

    // Fetch action inputs
    const inputs = {
      token: core.getInput("token"),
      commitMessage: core.getInput("commit-message"),
      commitAuthorName: core.getInput("author-name"),
      commitAuthorEmail: core.getInput("author-email"),
      committerName: core.getInput("committer-name"),
      committerEmail: core.getInput("committer-email"),
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
      debugEvent: core.getInput("debug-event")
    };
    core.debug(`Inputs: ${inspect(inputs)}`);

    // Set environment variables from inputs.
    if (inputs.token) process.env.GITHUB_TOKEN = inputs.token;
    if (inputs.commitMessage) process.env.COMMIT_MESSAGE = inputs.commitMessage;
    if (inputs.commitAuthorName) process.env.COMMIT_AUTHOR_NAME = inputs.commitAuthorName;
    if (inputs.commitAuthorEmail) process.env.COMMIT_AUTHOR_EMAIL = inputs.commitAuthorEmail;
    if (inputs.committerName) process.env.COMMITTER_NAME = inputs.committerName;
    if (inputs.committerEmail) process.env.COMMITTER_EMAIL = inputs.committerEmail;
    if (inputs.title) process.env.PULL_REQUEST_TITLE = inputs.title;
    if (inputs.body) process.env.PULL_REQUEST_BODY = inputs.body;
    if (inputs.labels) process.env.PULL_REQUEST_LABELS = inputs.labels;
    if (inputs.assignees) process.env.PULL_REQUEST_ASSIGNEES = inputs.assignees;
    if (inputs.reviewers) process.env.PULL_REQUEST_REVIEWERS = inputs.reviewers;
    if (inputs.teamReviewers) process.env.PULL_REQUEST_TEAM_REVIEWERS = inputs.teamReviewers;
    if (inputs.milestone) process.env.PULL_REQUEST_MILESTONE = inputs.milestone;
    if (inputs.project) process.env.PROJECT_NAME = inputs.project;
    if (inputs.projectColumn) process.env.PROJECT_COLUMN_NAME = inputs.projectColumn;
    if (inputs.branch) process.env.PULL_REQUEST_BRANCH = inputs.branch;
    if (inputs.base) process.env.PULL_REQUEST_BASE = inputs.base;
    if (inputs.branchSuffix) process.env.BRANCH_SUFFIX = inputs.branchSuffix;
    if (inputs.debugEvent) process.env.DEBUG_EVENT = inputs.debugEvent;

    // Execute python script
    await exec.exec("python", [`${src}/create-pull-request.py`]);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
