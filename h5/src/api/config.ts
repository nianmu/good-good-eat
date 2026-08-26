/**
 * 全局配置（H5 跨端）——好好吃饭
 * baseURL：开发环境用绝对地址，生产环境用相对路径（Nginx 反代）。
 */
const API_BASE = process.env.NODE_ENV === 'production'
  ? '/api' + '/v1'
  : 'http://127.0.0.1:8000/api' + '/v1'

export { API_BASE }

/**
 * 图片地址转换：Gitee raw 有 Referer 防盗链（网页内直接引用会被拒绝），
 * 将 HowToCook 的 gitee 直链换成本后端代理路径（/api/v1/media/htc/...）。
 * 非 gitee 链接（外链/相对路径）原样返回。
 */
const HTC_RAW_PREFIX = 'https://gitee.com/Anduin2017/HowToCook/raw/master/'
export const mediaUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined
  if (url.startsWith(HTC_RAW_PREFIX)) {
    return `${API_BASE}/media/htc/${url.slice(HTC_RAW_PREFIX.length)}`
  }
  return url
}

export default {
  apiBase: API_BASE
}
