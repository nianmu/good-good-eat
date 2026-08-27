/**
 * 请求封装（Taro.request）——好好吃饭
 * 统一的 {code, message, data} 信封解包、Bearer token 注入、
 * 401 自动游客登录重试一次、网络错误 toast。
 */
import Taro from '@tarojs/taro'
import config from './config'

interface RequestOpts {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  auth?: boolean
  _retried?: boolean
}

let token = ''

export function setToken(t: string) {
  token = t
  Taro.setStorageSync('ggc_token', t)
}

export function loadToken(): string {
  if (token) return token
  token = Taro.getStorageSync('ggc_token') || ''
  return token
}

/** 游客登录（联调走真实后端 /auth/guest）。已有有效 token 时跳过。 */
export async function guestLogin(nickname?: string): Promise<any> {
  if (token) return { token }  // 已有 token（含登录后），不覆盖
  const res = await request({ url: '/auth/guest', method: 'POST', data: { nickname }, auth: false })
  return saveAuth(res)
}

/** 保存 token + 用户（各登录通道共用） */
function saveAuth(res: any): any {
  if (res && res.token) {
    setToken(res.token)
    Taro.setStorageSync('ggc_user', res.user)
  }
  return res
}

/** H5 用户名+密码 登录（后端 /auth/login） */
export async function webLogin(username: string, password: string): Promise<any> {
  const res = await request({ url: '/auth/login', method: 'POST', data: { username, password }, auth: false })
  return saveAuth(res)
}

/** H5 独立账号注册（后端 /auth/register；携带游客会话时自动绑定并升级） */
export async function webRegister(username: string, password: string, nickname?: string): Promise<any> {
  const res = await request({ url: '/auth/register', method: 'POST', data: { username, password, nickname }, auth: false })
  return saveAuth(res)
}

/** 清除本地登录态（退出，回到游客） */
export function logout(): void {
  token = ''
  Taro.removeStorageSync('ggc_token')
  Taro.removeStorageSync('ggc_user')
  Taro.removeStorageSync('ggc_team')
}

export async function request<T = any>(opts: RequestOpts): Promise<T> {
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth !== false) {
    const t = loadToken()
    if (t) header.Authorization = 'Bearer ' + t
  }

  try {
    const res = await Taro.request({
      url: config.apiBase + opts.url,
      method: opts.method || 'GET',
      // GET 不携带 body（Taro 会把 data 序列化为 query，空对象会产生多余 "?"）
      data: opts.method && opts.method !== 'GET' ? opts.data ?? {} : opts.data,
      header
    })

    const body = res.data || {}
    if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
      return body.data as T
    }
    if (res.statusCode === 401 && opts.auth !== false && !opts._retried) {
      // token 失效 → 清除旧 token，重新游客登录后重试一次
      token = ''
      Taro.removeStorageSync('ggc_token')
      await guestLogin()
      return request<T>({ ...opts, _retried: true })
    }
    throw new Error(body.message || `请求失败（${res.statusCode}）`)
  } catch (e: any) {
    // 网络层错误判定：Taro 各端抛错形态不一（errMsg/message），
    // 统一按 request:fail / 超时 / 断网关键字识别，业务错误不弹网络提示
    const msg = String(e?.errMsg || e?.message || '')
    const isNetworkError = !e?.statusCode && (
      msg === 'NetworkError' ||
      msg.includes('request:fail') ||
      /timeout|abort|network|Failed to fetch/i.test(msg)
    )
    if (isNetworkError) {
      Taro.showToast({ title: '网络异常，请检查', icon: 'none' })
    }
    throw e
  }
}
