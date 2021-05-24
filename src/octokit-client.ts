import {Octokit as Core} from '@octokit/core'
import {paginateRest} from '@octokit/plugin-paginate-rest'
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods'
import {HttpsProxyAgent} from 'https-proxy-agent'
export {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'
export {OctokitOptions} from '@octokit/core/dist-types/types'

export const Octokit = Core.plugin(
  paginateRest,
  restEndpointMethods,
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
