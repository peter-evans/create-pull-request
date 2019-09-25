const core = require('@actions/core');
const exec = require('@actions/exec');
const os = require('os');

async function run() {
  try {
    core.info(`platform: ${os.platform()}`)
    core.info(`action directory: ${__dirname}`)

    if (os.platform() == 'linux') {
      await exec.exec('sudo apt-get install python3-setuptools');
    }
    await exec.exec(`pip3 install --requirement ${__dirname}/requirements.txt`);
    if (os.platform() == 'win32') {
      await exec.exec(`python ${__dirname}/create-pull-request.py`);
    } else {
      await exec.exec(`python3 ${__dirname}/create-pull-request.py`);
    }
  } 
  catch (error) {
    core.setFailed(error.message);
  }
}

run()
