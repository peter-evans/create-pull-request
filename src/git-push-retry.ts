import Bottleneck from 'bottleneck'
import * as core from '@actions/core'
import {GitCommandManager} from './git-command-manager'

const retryableErrors = [
  'You have triggered an abuse detection mechanism and have been temporarily blocked from content creation. Please retry your request again later.'
]
const maxRetries = 3
const waitMilliseconds = 60000

const limiter = new Bottleneck()

limiter.on('failed', async (error, jobInfo) => {
  const id = jobInfo.options.id
  core.warning(`Job '${id}' failed: ${error}`)

  if (error.message in retryableErrors && jobInfo.retryCount < maxRetries) {
    core.info(`Retrying job '${id}' in ${waitMilliseconds}ms`)
    return waitMilliseconds + randomFromInterval(0, 10000)
  }
})

limiter.on('retry', (error, jobInfo) =>
  core.info(`Now retrying job '${jobInfo.options.id}'`)
)

function randomFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

export async function pushWithRetry(
  git: GitCommandManager,
  options: string[]
): Promise<void> {
  await limiter.schedule({id: 'git push'}, () => git.push(options))
}
