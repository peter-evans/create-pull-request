import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as path from 'path'
import * as semver from 'semver'

/**
 * Setup for Python from the GitHub Actions tool cache
 * Converted from https://github.com/actions/setup-python
 *
 * @param {string} versionSpec version of Python
 * @param {string} arch architecture (x64|x32)
 */
export function setupPython(versionSpec: string, arch: string): Promise<void> {
  return new Promise(resolve => {
    const IS_WINDOWS = process.platform === 'win32'

    // Find the version of Python we want in the tool cache
    const installDir = tc.find('Python', versionSpec, arch)
    core.debug(`installDir: ${installDir}`)

    // Set paths
    core.exportVariable('pythonLocation', installDir)
    core.addPath(installDir)
    if (IS_WINDOWS) {
      core.addPath(path.join(installDir, 'Scripts'))
    } else {
      core.addPath(path.join(installDir, 'bin'))
    }

    if (IS_WINDOWS) {
      // Add --user directory
      // `installDir` from tool cache should look like $AGENT_TOOLSDIRECTORY/Python/<semantic version>/x64/
      // So if `findLocalTool` succeeded above, we must have a conformant `installDir`
      const version = path.basename(path.dirname(installDir))
      const major = semver.major(version)
      const minor = semver.minor(version)

      const userScriptsDir = path.join(
        process.env['APPDATA'] || '',
        'Python',
        `Python${major}${minor}`,
        'Scripts'
      )
      core.addPath(userScriptsDir)
    }
    // On Linux and macOS, pip will create the --user directory and add it to PATH as needed.

    resolve()
  })
}
