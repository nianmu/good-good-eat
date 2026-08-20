/**
 * 团队协作购物车 WebSocket 客户端（三期）——好好吃饭
 * 连接 /ws/team/{teamId}?token=...，收发购物车实时事件。
 * 协议见 server/app/ws/handlers.py。
 */
import Taro from '@tarojs/taro'
import config from '../api/config'

export type TeamCartEvent = { event: string; data?: any; seq?: number }

function wsBase(): string {
  const base = (config.apiBase || '').toString()
  return base
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
    .replace(/\/api\/v1$/, '')
}

export class TeamCartSocket {
  private task: any
  private connected = false
  private listeners: Array<(e: TeamCartEvent) => void> = []

  constructor(private teamId: string | number, private token: string) {}

  /** 连接并在 onOpen 后自动发送 join；返回 Promise 供外部 await */
  connect(): Promise<void> {
    const url = `${wsBase()}/ws/team/${this.teamId}?token=${encodeURIComponent(this.token)}`
    return new Promise((resolve) => {
      Taro.connectSocket({ url }).then((task) => {
        this.task = task
        task.onOpen(() => {
          this.connected = true
          // 自动 join
          this.send('join', {})
          this.listeners.forEach((l) => l({ event: 'open' }))
          resolve()
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
        task.onClose(() => {
          this.connected = false
          this.listeners.forEach((l) => l({ event: 'close' }))
        })
        task.onError(() => {
          this.connected = false
          resolve()
        })
      }).catch(() => {
        this.connected = false
        resolve()
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
}
