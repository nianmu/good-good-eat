/**
 * 轻量全局状态（跨端）——好好吃饭
 * 基于 Taro 的 Storage + 内存缓存，简单发布订阅。
 */
import Taro from '@tarojs/taro'

interface StoreData {
  user?: any
  cart: Record<string, number>
  currentTeamId?: string
}

const listeners: Record<string, Array<() => void>> = {}

const cache: StoreData = {
  cart: {}
}

function readStore(): StoreData {
  try {
    const u = Taro.getStorageSync('ggc_user')
    const c = Taro.getStorageSync('ggc_cart') || {}
    const t = Taro.getStorageSync('ggc_team')
    return { user: u || undefined, cart: c, currentTeamId: t || undefined }
  } catch (e) {
    return { cart: {} }
  }
}

function emit(key: string) {
  ;(listeners[key] || []).forEach((fn) => fn())
}

export const store = {
  get<K extends keyof StoreData>(key: K): StoreData[K] {
    if (key === 'cart') {
      const d = readStore()
      return d.cart as StoreData[K]
    }
    if (key === 'user') {
      try {
        return (Taro.getStorageSync('ggc_user') || undefined) as StoreData[K]
      } catch {
        return undefined as StoreData[K]
      }
    }
    if (key === 'currentTeamId') {
      try {
        return (Taro.getStorageSync('ggc_team') || undefined) as StoreData[K]
      } catch {
        return undefined as StoreData[K]
      }
    }
    return undefined as StoreData[K]
  },
  set<K extends keyof StoreData>(key: K, value: StoreData[K]) {
    if (key === 'user') Taro.setStorageSync('ggc_user', value || '')
    else if (key === 'cart') Taro.setStorageSync('ggc_cart', value || {})
    else if (key === 'currentTeamId') Taro.setStorageSync('ggc_team', value || '')
    emit(key)
  },
  onChange<K extends keyof StoreData>(key: K, fn: () => void) {
    if (!listeners[key as string]) listeners[key as string] = []
    listeners[key as string].push(fn)
    return () => {
      listeners[key as string] = (listeners[key as string] || []).filter((f) => f !== fn)
    }
  },
  /** 购物车：设某一菜品数量 */
  setCartQuantity(dishId: number | string, qty: number) {
    const cart = this.get('cart') || {}
    if (qty <= 0) delete cart[dishId]
    else cart[dishId] = qty
    this.set('cart', cart)
  }
}

export default store
