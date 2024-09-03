import * as core from '@actions/core'
import {Octokit as OctokitCore} from '@octokit/core'
import {paginateRest} from '@octokit/plugin-paginate-rest'
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods'
import {throttling} from '@octokit/plugin-throttling'
import {getProxyForUrl} from 'proxy-from-env'
import {ProxyAgent, fetch as undiciFetch} from 'undici'
export {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'
// eslint-disable-next-line import/no-unresolved
export {OctokitOptions} from '@octokit/core/dist-types/types'

export const Octokit = OctokitCore.plugin(
  paginateRest,
  restEndpointMethods,
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

const proxyFetch =
  (proxyUrl: string): typeof undiciFetch =>
  (url, opts) => {
    return undiciFetch(url, {
      ...opts,
      dispatcher: new ProxyAgent({
        uri: proxyUrl
      })
    })
  }

// Octokit plugin to support the standard environment variables http_proxy, https_proxy and no_proxy
function autoProxyAgent(octokit: OctokitCore) {
  octokit.hook.before('request', options => {
    const proxy = getProxyForUrl(options.baseUrl)
    if (proxy) {
      options.request.fetch = proxyFetch(proxy)
    }
  })
}
