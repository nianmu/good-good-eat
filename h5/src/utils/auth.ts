/**
 * 登录态判断工具——好好吃饭
 * 游客可浏览，下单/创建团队等关键操作前弹窗引导登录。
 */
import Taro from '@tarojs/taro'
import { showModal } from '../components/app-modal'

/** 当前用户是否为游客（未注册/未登录） */
export function isGuest(): boolean {
  try {
    const user = Taro.getStorageSync('ggc_user')
    if (!user) return true
    // 后端 user_to_dict 返回 is_guest 字段：true=游客，false=已注册用户
    return user.is_guest === true || user.is_guest === 1
  } catch {
    return true
  }
}

/**
 * 需要登录才能执行的操作：检查登录态，游客弹窗引导。
 * @returns true=已登录可继续；false=游客被拦截
 */
export function requireLogin(prompt = '请先登录后再操作'): boolean {
  if (!isGuest()) return true

  showModal({
    title: '提示',
    content: prompt + '\n登录后订单和数据将永久保存',
    confirmText: '去登录',
    cancelText: '取消',
    success(res) {
      if (res.confirm) {
        Taro.navigateTo({ url: '/pages/auth/index' })
      }
    }
  })
  return false
}
