import {Octokit as Core} from '@octokit/core'
import {paginateRest} from '@octokit/plugin-paginate-rest'
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods'
import {getProxyForUrl} from 'proxy-from-env'
import {ProxyAgent, fetch as undiciFetch} from 'undici'
export {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'
export {OctokitOptions} from '@octokit/core/dist-types/types'

export const Octokit = Core.plugin(
  paginateRest,
  restEndpointMethods,
  autoProxyAgent
)

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
function autoProxyAgent(octokit: Core) {
  octokit.hook.before('request', options => {
    const proxy = getProxyForUrl(options.baseUrl)
    if (proxy) {
      options.request.fetch = proxyFetch(proxy)
    }
  })
}
