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

// Octokit plugin to support the https_proxy and no_proxy environment variable
function autoProxyAgent(octokit: Core) {
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY

  const noProxy = process.env.no_proxy || process.env.NO_PROXY
  let noProxyArray: string[] = []
  if (noProxy) {
    noProxyArray = noProxy.split(',')
  }

  if (!proxy) return

  const agent = new HttpsProxyAgent(proxy)
  octokit.hook.before('request', options => {
    if (noProxyArray.includes(options.request.hostname)) {
      return
    }
    options.request.agent = agent
  })
}
