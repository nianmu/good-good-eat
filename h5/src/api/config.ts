/**
 * 全局配置（H5 跨端）——好好吃饭
 * baseURL：开发环境用绝对地址，生产环境用相对路径（Nginx 反代）。
 */
const API_BASE = process.env.NODE_ENV === 'production'
  ? '/api' + '/v1'
  : 'http://127.0.0.1:8000/api' + '/v1'

export default {
  apiBase: API_BASE
}
