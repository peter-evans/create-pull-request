import * as core from '@actions/core'
import {Octokit as OctokitCore} from '@octokit/core'
import {paginateRest} from '@octokit/plugin-paginate-rest'
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods'
import {retry} from '@octokit/plugin-retry'
import {throttling} from '@octokit/plugin-throttling'
import {fetch} from 'node-fetch-native/proxy'
export {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'
// eslint-disable-next-line import/no-unresolved
export {OctokitOptions} from '@octokit/core/dist-types/types'

export const Octokit = OctokitCore.plugin(
  paginateRest,
  restEndpointMethods,
  retry,
  throttling,
  autoProxyAgent
)

export const throttleOptions = {
  onRateLimit: (retryAfter, options, _, retryCount) => {
    core.debug(`Hit rate limit for request ${options.method} ${options.url}`)
    // Retries twice for a total of three attempts
    if (retryCount < 2) {
      core.debug(`Retrying after ${retryAfter} seconds!`)
      return true
    }
  },
  onSecondaryRateLimit: (retryAfter, options) => {
    core.warning(
      `Hit secondary rate limit for request ${options.method} ${options.url}`
    )
    core.warning(`Requests may be retried after ${retryAfter} seconds.`)
  }
}

export const retryOptions = {
  // 429 is handled by the throttling plugin, so we exclude it from retry
  doNotRetry: [400, 401, 403, 404, 410, 422, 429, 451]
}

// Octokit plugin to support the standard environment variables http_proxy, https_proxy and no_proxy
function autoProxyAgent(octokit: OctokitCore) {
  octokit.hook.before('request', options => {
    options.request.fetch = fetch
  })
}
