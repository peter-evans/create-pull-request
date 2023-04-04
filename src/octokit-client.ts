import {Octokit as Core} from '@octokit/core'
import {paginateRest} from '@octokit/plugin-paginate-rest'
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods'
import {HttpsProxyAgent} from 'https-proxy-agent'
import {getProxyForUrl} from 'proxy-from-env'
export {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'
export {OctokitOptions} from '@octokit/core/dist-types/types'

export const Octokit = Core.plugin(
  paginateRest,
  restEndpointMethods,
  autoProxyAgent
)

// Octokit plugin to support the standard environment variables http_proxy, https_proxy and no_proxy
function autoProxyAgent(octokit: Core) {
  octokit.hook.before('request', options => {
    const proxy = getProxyForUrl(options.baseUrl)
    if (proxy) {
      options.request.agent = new HttpsProxyAgent(proxy)
    }
  })
}
