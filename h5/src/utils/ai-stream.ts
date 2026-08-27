/**
 * AI 对话统一流式客户端（跨端）——好好吃饭
 * 屏蔽 H5（fetch + ReadableStream）与微信小程序（Taro.request enableChunked）差异，
 * 上层页面只关心 text 增量 / 菜品推荐 / 结束 / 错误 四类回调。
 *
 * 后端契约（POST /api/v1/ai/chat，SSE）：
 *   data: {"type":"text","delta":"..."}          —— 打字机文本增量
 *   data: {"type":"dishes","items":[{dish_id,name,emoji,price,quantity}]} —— 可加购菜品
 *   data: {"type":"done"}                        —— 流结束
 *   data: {"type":"error","message":"..."}       —— 错误（未配置/上游异常）
 *
 * 注意：需登录（携带 Bearer token）；页面内存维护会话，刷新即清空。
 */
import Taro from '@tarojs/taro'
import config from '../api/config'
import { loadToken } from '../api/request'

export interface AiDishItem {
  dish_id: number
  name: string
  emoji?: string
  price?: number
  quantity: number
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiStreamHandlers {
  /** 文本流式增量（打字机） */
  onDelta?: (delta: string) => void
  /** 菜品推荐（多选卡数据） */
  onDishes?: (items: AiDishItem[]) => void
  /** 流正常结束 */
  onDone?: () => void
  /** 错误（含后端 error 事件与网络异常） */
  onError?: (message: string) => void
  /** 流开始（可用于置 loading / 防连点） */
  onStart?: () => void
  /** 流结束（无论成败，可用 finally 语义） */
  onFinish?: () => void
}

/** 解析一段 SSE 文本（"data: {...}\n\n"）为事件列表 */
function parseSseEvents(text: string): Array<Record<string, any>> {
  const events: Array<Record<string, any>> = []
  const lines = text.split('\n')
  for (const line of lines) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') continue
    try {
      events.push(JSON.parse(data))
    } catch {
      // 忽略非法行
    }
  }
  return events
}

/** 分发事件到回调 */
function dispatchEvents(events: Array<Record<string, any>>, handlers: AiStreamHandlers) {
  for (const evt of events) {
    if (evt.type === 'text' && typeof evt.delta === 'string' && evt.delta) {
      handlers.onDelta?.(evt.delta)
    } else if (evt.type === 'dishes' && Array.isArray(evt.items)) {
      handlers.onDishes?.(evt.items as AiDishItem[])
    } else if (evt.type === 'error') {
      handlers.onError?.(String(evt.message || 'AI 服务异常'))
    } else if (evt.type === 'done') {
      handlers.onDone?.()
    }
  }
}

/**
 * 发起 AI 对话流式请求。
 * H5：fetch + ReadableStream 逐块解析；weapp：Taro.request enableChunked（真机/开发者工具支持）。
 */
export async function streamChat(
  messages: AiMessage[],
  handlers: AiStreamHandlers = {}
): Promise<void> {
  const token = loadToken()
  const url = config.apiBase + '/ai/chat'
  const body = JSON.stringify({ messages })
  const header: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) header.Authorization = 'Bearer ' + token

  handlers.onStart?.()
  try {
    if (process.env.TARO_ENV === 'weapp') {
      await streamChatWeapp(url, body, header, handlers)
    } else {
      await streamChatH5(url, body, header, handlers)
    }
  } catch (e: any) {
    // 网络层失败 / 非 SSE 错误响应 → 统一走 onError（后端 error 事件已由 dispatchEvents 分发，不会走到这里）
    const msg = String(e?.message || e?.errMsg || '网络异常，请稍后再试')
    const friendly =
      msg.includes('Failed to fetch') || msg.includes('request:fail') || msg.includes('NetworkError')
        ? '网络异常，请检查后重试'
        : msg
    handlers.onError?.(friendly)
  } finally {
    handlers.onFinish?.()
  }
}

/** H5：fetch + ReadableStream 逐块解析 SSE */
async function streamChatH5(
  url: string,
  body: string,
  header: Record<string, string>,
  handlers: AiStreamHandlers
): Promise<void> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: header,
    body,
  })
  if (!resp.ok) {
    throw new Error(`请求失败（${resp.status}）`)
  }
  if (!resp.body) {
    throw new Error('浏览器不支持流式响应')
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE 以空行分隔事件；缓冲里可能残留半条，留到下次再解析
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      const events = parseSseEvents(parts.join('\n\n'))
      dispatchEvents(events, handlers)
    }
    if (buffer.trim()) {
      dispatchEvents(parseSseEvents(buffer), handlers)
    }
  } finally {
    reader.releaseLock()
  }
}

/** weapp：Taro.request({ enableChunked, responseType: 'arraybuffer' }) 分块缓冲解析 */
async function streamChatWeapp(
  url: string,
  body: string,
  header: Record<string, string>,
  handlers: AiStreamHandlers
): Promise<void> {
  const task: any = Taro.request({
    url,
    method: 'POST',
    data: body,
    header,
    enableChunked: true,
    responseType: 'arraybuffer',
  })

  return new Promise<void>((resolve, reject) => {
    let buffer = ''
    let settled = false
    const decoder = new TextDecoder('utf-8')

    const finalize = () => {
      if (buffer.trim()) dispatchEvents(parseSseEvents(buffer), handlers)
      buffer = ''
    }
    const finish = () => {
      if (settled) return
      settled = true
      finalize()
      resolve()
    }
    const fail = (e: any) => {
      if (settled) return
      settled = true
      reject(e)
    }

    if (task && typeof task.onChunkReceived === 'function') {
      // 分块模式：逐块解码累积，遇空行边界解析
      task.onChunkReceived((res: any) => {
        const bytes = res?.data || res?.arrayBuffer
        if (bytes) {
          buffer += decoder.decode(new Uint8Array(bytes), { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          dispatchEvents(parseSseEvents(parts.join('\n\n')), handlers)
        }
      })
      task.then(() => finish(), (e: any) => fail(e))
    } else {
      // 兼容不支持分块的端：等整包返回再解析（无打字机效果）
      task.then(
        (res: any) => {
          try {
            // arraybuffer 响应体：Taro 会放在 res.data（ArrayBuffer）
            const bytes = res?.data
            if (bytes instanceof ArrayBuffer || (ArrayBuffer.isView(bytes))) {
              buffer += decoder.decode(new Uint8Array(bytes as any))
            }
          } catch {
            /* 忽略解码差异 */
          }
          finish()
        },
        (e: any) => fail(e)
      )
    }
  })
}

export default streamChat