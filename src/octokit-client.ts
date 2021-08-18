import {Octokit as Core} from '@octokit/core'
import {paginateRest} from '@octokit/plugin-paginate-rest'
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods'
import {retry} from '@octokit/plugin-retry'
import {HttpsProxyAgent} from 'https-proxy-agent'
export {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'
export {OctokitOptions} from '@octokit/core/dist-types/types'

export const Octokit = Core.plugin(
  paginateRest,
  restEndpointMethods,
  retry,
  autoProxyAgent
)

// Octokit plugin to support the https_proxy environment variable
function autoProxyAgent(octokit: Core) {
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY
  if (!proxy) return

  const agent = new HttpsProxyAgent(proxy)
  octokit.hook.before('request', options => {
    options.request.agent = agent
  })
}

export const retryOptions = {
  // Allow retry for 403 (rate-limiting / abuse detection)
  doNotRetry: [400, 401, 404, 422],
  retryAfterBaseValue: 2000,
  retries: 3
}
