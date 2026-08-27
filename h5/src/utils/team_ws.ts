/**
 * 团队协作购物车 WebSocket 客户端（三期）——好好吃饭
 * 连接 /ws/team/{teamId}，通过 Sec-WebSocket-Protocol 携带 token
 * （protocols: ["ggc-token", <jwt>]），避免 token 出现在 URL 中。
 * 内置心跳保活 + 断线自动重连（指数退避，上限 30s）。
 * 协议见 server/app/ws/handlers.py。
 */
import Taro from '@tarojs/taro'
import config from '../api/config'

export type TeamCartEvent = { event: string; data?: any; seq?: number }

const WS_AUTH_PROTOCOL = 'ggc-token'
const HEARTBEAT_INTERVAL = 30_000
const RECONNECT_BASE_DELAY = 3_000
const RECONNECT_MAX_DELAY = 30_000

function wsBase(): string {
  const base = (config.apiBase || '').toString()
  let url = base
    .replace(/\/api\/v1$/, '')
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
  // 生产同域部署时 apiBase 为相对路径 → 补全为当前页面的 ws(s):// origin
  if (/^\/\S/.test(url)) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin
      const proto = origin.startsWith('https') ? 'wss://' : 'ws://'
      url = proto + origin.replace(/^https?:\/\//, '') + url
    } else {
      // 小程序端无 window，相对路径无法建连，退回根路径
      url = ''
    }
  }
  return url
}

export class TeamCartSocket {
  private task: any
  private connected = false
  private closedByUser = false
  private settled = false
  private listeners: Array<(e: TeamCartEvent) => void> = []
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private attempts = 0

  constructor(private teamId: string | number, private token: string, private autoReconnect = true) {}

  /** 连接并在 onOpen 后自动发送 join；返回 Promise 供外部 await（失败也 resolve，靠 open/close 事件区分） */
  connect(): Promise<void> {
    this.closedByUser = false
    this.settled = false
    const url = `${wsBase()}/ws/team/${this.teamId}`
    return new Promise((resolve) => {
      Taro.connectSocket({
        url,
        // token 经子协议传递；服务端会回显 "ggc-token" 完成握手
        protocols: [WS_AUTH_PROTOCOL, this.token]
      }).then((task) => {
        this.task = task
        task.onOpen(() => {
          this.connected = true
          this.attempts = 0
          this.startHeartbeat()
          // 自动 join
          this.send('join', {})
          this.listeners.forEach((l) => l({ event: 'open' }))
          if (!this.settled) {
            this.settled = true
            resolve()
          }
        })
        task.onMessage((res: any) => {
          const raw = typeof res === 'string' ? res : res?.data
          try {
            const msg: TeamCartEvent = JSON.parse(raw)
            this.listeners.forEach((l) => l(msg))
          } catch {
            /* 忽略非 JSON（心跳等） */
          }
        })
        task.onClose(() => this.handleDisconnect())
        task.onError(() => this.handleDisconnect())
      }).catch(() => {
        this.connected = false
        if (!this.settled) {
          this.settled = true
          resolve()
        }
        this.scheduleReconnect()
      })
    })
  }

  onMessage(fn: (e: TeamCartEvent) => void) {
    this.listeners.push(fn)
  }

  send(event: string, data: any = {}) {
    if (this.connected && this.task) {
      this.task.send({ data: JSON.stringify({ event, data }) })
    }
  }

  close() {
    this.closedByUser = true
    this.stopTimers()
    if (this.task) {
      try {
        this.task.close()
      } catch {
        /* ignore */
      }
    }
    this.connected = false
    this.task = undefined
  }

  /** 销毁监听（页面卸载时调用，防内存泄漏） */
  destroy() {
    this.close()
    this.listeners = []
  }

  private handleDisconnect() {
    const wasConnected = this.connected
    this.connected = false
    this.stopHeartbeat()
    // 已建连后断开、或首连失败：都通知监听方
    if (wasConnected || !this.settled) {
      this.listeners.forEach((l) => l({ event: 'close' }))
    }
    this.settled = true
    if (!this.closedByUser && this.autoReconnect) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer) return
    const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** this.attempts, RECONNECT_MAX_DELAY)
    this.attempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      if (!this.closedByUser) {
        this.connect().catch(() => {/* 重连失败由下一轮退避处理 */})
      }
    }, delay)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    // 周期发送 pong 保持链路活跃（服务端对 pong 无副作用）
    this.heartbeatTimer = setInterval(() => {
      this.send('pong', {})
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private stopTimers() {
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }
}
