/**
 * 全局配置（H5 跨端）——好好吃饭
 * baseURL：留空使用相对路径，由 Nginx 反代 /api/ 到后端。
 * 本地开发时 Taro dev server 需要配合 proxy 或改为绝对地址。
 */
const API_BASE = ''

export default {
  apiBase: API_BASE
}
