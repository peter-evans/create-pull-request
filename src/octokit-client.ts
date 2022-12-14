import * as core from '@actions/core'
import {Octokit as OctokitCore} from '@octokit/core'
import {paginateRest} from '@octokit/plugin-paginate-rest'
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods'
import {throttling} from '@octokit/plugin-throttling'
import ProxyAgent from 'proxy-agent'
export {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'
export {OctokitOptions} from '@octokit/core/dist-types/types'

export const Octokit = OctokitCore.plugin(
  paginateRest,
  restEndpointMethods,
  throttling,
  autoProxyAgent
)

export const throttleOptions = {
  minimumSecondaryRateRetryAfter: 60,
  onRateLimit: (retryAfter, options, _, retryCount) => {
    core.debug(`Hit rate limit for request ${options.method} ${options.url}`)
    if (retryCount < 1) {
      core.debug(`Retrying after ${retryAfter} seconds!`)
      return true
    }
  },
  onSecondaryRateLimit: (retryAfter, options, _, retryCount) => {
    core.debug(
      `Hit secondary rate limit for request ${options.method} ${options.url}`
    )
    if (retryCount < 1) {
      core.debug(`Retrying after ${retryAfter} seconds!`)
      return true
    }
  }
}

// Octokit plugin to support the standard environment variables http_proxy, https_proxy and no_proxy
function autoProxyAgent(octokit: OctokitCore) {
  const proxy =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY

  if (!proxy) return

  const agent = new ProxyAgent()
  octokit.hook.before('request', options => {
    options.request.agent = agent
  })
}
