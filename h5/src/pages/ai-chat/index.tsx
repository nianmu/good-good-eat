/**
 * AI 智能点菜（对话式每餐推荐）——好好吃饭（跨端 H5）
 *
 * 能力：
 * - 多轮对话：AI 结合当前用户可见菜品 + 冰箱食材（后端全量注入）推荐一桌菜
 * - 打字机流式渲染（SSE text 增量）
 * - 菜品多选卡（dishes 事件）：默认全选、数量可调，一键加入本地购物车（store.setCartQuantity）
 *
 * 会话仅 memory：socket 存于 useState，刷新即清空（不落库）。
 */
import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Input } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'

import { showToast } from '../../components/app-toast'
import { guestLogin } from '../../api'
import { store } from '../../store'
import { streamChat } from '../../utils/ai-stream'
import type { AiDishItem, AiMessage } from '../../utils/ai-stream'

const GREENS = { primary: '#4CAF50', primaryDark: '#388E3C', primaryBg: '#E8F5E9' }

interface ChatMsg {
  id: number
  role: 'user' | 'assistant'
  /** 流式累积文本 */
  text: string
  /** 是否仍在流式输出（打字机中） */
  streaming?: boolean
  /** 菜品推荐卡（assistant 消息可选） */
  dishes?: AiDishItem[]
  /** 每道菜的勾选状态 */
  selected?: Record<number, boolean>
  /** 每道菜的数量 */
  quantities?: Record<number, number>
  /** 已加入购物车标记（该卡） */
  added?: boolean
  error?: string
}

const WELCOME_TEXT = '👋 我是 AI 点菜助手。告诉我今天几个人吃、想吃什么口味或预算，也可以说说冰箱里有什么，我来帮你搭配一桌菜～'

const SUGGESTIONS = ['两个人，三个菜一荤一素一汤', '根据冰箱现有食材，能做点什么', '天冷想吃点暖和的']

let _seq = 0
const nextId = () => ++_seq

export default function AiChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: nextId(), role: 'assistant', text: WELCOME_TEXT },
  ])
  // 发送给后端的对话历史（system 由后端注入）
  const [history, setHistory] = useState<AiMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [scrollAnchor, setScrollAnchor] = useState(0)

  const scrollToBottom = useCallback(() => {
    setScrollAnchor((n) => n + 1)
  }, [])

  useLoad(async () => {
    // 保证有 token（游客自动登录），否则 AI 接口 401
    await guestLogin().catch(() => null)
  })

  const patchLastAssistant = (patch: Partial<ChatMsg>) => {
    setMessages((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant' && next[i].streaming) {
          next[i] = { ...next[i], ...patch }
          break
        }
      }
      return next
    })
    scrollToBottom()
  }

  const appendToStreaming = (delta: string) => {
    setMessages((prev) => {
      const next = [...prev]
      for (let i = next.length - 1; i >= 0; i--) {
        const m = next[i]
        if (m.role === 'assistant' && m.streaming) {
          next[i] = { ...m, text: m.text + delta }
          break
        }
      }
      return next
    })
    scrollToBottom()
  }

  const onSend = async (rawText?: string) => {
    const content = (rawText ?? input).trim()
    if (!content || busy) return
    setInput('')

    const userMsg: ChatMsg = { id: nextId(), role: 'user', text: content }
    const aiMsg: ChatMsg = { id: nextId(), role: 'assistant', text: '', streaming: true }
    const nextHistory: AiMessage[] = [...history, { role: 'user', content }]
    setMessages((prev) => [...prev, userMsg, aiMsg])
    setHistory(nextHistory)
    setBusy(true)
    scrollToBottom()

    let assistantFullText = ''

    await streamChat(
      nextHistory,
      {
        onStart: () => {},
        onDelta: (delta) => {
          assistantFullText += delta
          appendToStreaming(delta)
        },
        onDishes: (items) => {
          const selected: Record<number, boolean> = {}
          const quantities: Record<number, number> = {}
          items.forEach((it) => {
            selected[it.dish_id] = true
            quantities[it.dish_id] = Math.max(1, it.quantity || 1)
          })
          patchLastAssistant({ dishes: items, selected, quantities })
        },
        onDone: () => {
          patchLastAssistant({ streaming: false, text: assistantFullText || '（AI 没有回复，请换个问法）' })
          setHistory((prev) => [
            ...prev,
            { role: 'assistant', content: assistantFullText },
          ])
        },
        onError: (message) => {
          patchLastAssistant({
            streaming: false,
            text: assistantFullText || '',
            error: message,
          })
          showToast({ title: message, icon: 'none' })
        },
        onFinish: () => setBusy(false),
      }
    )
  }

  const toggleDish = (msgId: number, dishId: number) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.dishes) return m
        const selected = { ...(m.selected || {}) }
        selected[dishId] = !selected[dishId]
        return { ...m, selected, added: false }
      })
    )
  }

  const changeQty = (msgId: number, dishId: number, step: number) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.dishes) return m
        const quantities = { ...(m.quantities || {}) }
        const next = Math.max(0, (quantities[dishId] || 1) + step)
        quantities[dishId] = next
        return { ...m, quantities, added: false }
      })
    )
  }

  const addToCart = (msg: ChatMsg) => {
    const sel = msg.selected || {}
    const qts = msg.quantities || {}
    let count = 0
    msg.dishes!.forEach((it) => {
      if (!sel[it.dish_id]) return
      const qty = qts[it.dish_id] || 1
      if (qty > 0) {
        store.setCartQuantity(it.dish_id, qty)
        count += 1
      }
    })
    if (!count) {
      showToast({ title: '先勾选几道菜', icon: 'none' })
      return
    }
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, added: true } : m)))
    showToast({ title: `已加入购物车（${count} 道）`, icon: 'success' })
  }

  const selectedCount = (msg: ChatMsg) =>
    (msg.dishes || []).filter((it) => msg.selected?.[it.dish_id] && (msg.quantities?.[it.dish_id] || 1) > 0).length

  const renderDishCard = (msg: ChatMsg) => {
    const items = msg.dishes || []
    if (!items.length) return null
    const selCount = selectedCount(msg)
    return (
      <View style={{ marginTop: 10, background: '#fff', borderRadius: 12, border: '1px solid #E8E8E8', overflow: 'hidden' }}>
        <View style={{ padding: '10px 12px', background: GREENS.primaryBg, fontSize: 13, fontWeight: 600, color: GREENS.primaryDark }}>
          🍽 推荐菜品（勾选后加入购物车）
        </View>
        {items.map((it) => {
          const checked = !!msg.selected?.[it.dish_id]
          const qty = msg.quantities?.[it.dish_id] || 1
          return (
            <View key={it.dish_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #F5F5F5' }}>
              {/* 自定义勾选框 */}
              <View
                onClick={() => toggleDish(msg.id, it.dish_id)}
                style={{
                  width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                  border: checked ? 'none' : '2px solid #D0D0D0',
                  background: checked ? GREENS.primary : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                {checked && <Text style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</Text>}
              </View>
              {/* emoji 色块 */}
              <View style={{ width: 36, height: 36, borderRadius: 8, background: '#F1F8E9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {it.emoji || '🍽'}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: 500, display: 'block' }}>{it.name}</Text>
                {!!it.price && <Text style={{ fontSize: 12, color: '#F44336' }}>¥{it.price}</Text>}
              </View>
              {/* 数量步进器 */}
              <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <View onClick={() => changeQty(msg.id, it.dish_id, -1)} style={qtyBtn}>−</View>
                <Text style={{ width: 18, textAlign: 'center', fontSize: 14 }}>{qty}</Text>
                <View onClick={() => changeQty(msg.id, it.dish_id, 1)} style={{ ...qtyBtn, background: GREENS.primary, color: '#fff' }}>+</View>
              </View>
            </View>
          )
        })}
        <View style={{ padding: '10px 12px' }}>
          {msg.added ? (
            <Button
              type="primary"
              size="small"
              block
              onClick={() => Taro.navigateTo({ url: '/pages/cart/index' })}
            >
              🛒 去购物车查看（{selCount} 道）
            </Button>
          ) : (
            <Button
              type="primary"
              size="small"
              block
              disabled={!selCount}
              onClick={() => addToCart(msg)}
            >
              {selCount ? `加入购物车（${selCount} 道）` : '请先勾选菜品'}
            </Button>
          )}
          <Text style={{ display: 'block', fontSize: 11, color: '#999', textAlign: 'center', marginTop: 6 }}>
            {msg.added ? '已加入购物车，可继续点菜或去结算' : '勾选菜品并调整数量后加入购物车'}
          </Text>
        </View>
      </View>
    )
  }

  const renderBubble = (msg: ChatMsg) => {
    const isUser = msg.role === 'user'
    return (
      <View
        key={msg.id}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
          padding: '6px 0',
          minWidth: 0,
        }}
      >
        <View
          style={{
            maxWidth: '80%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 12,
            fontSize: 14,
            lineHeight: 1.55,
            background: isUser ? GREENS.primary : '#fff',
            color: isUser ? '#fff' : '#1A1A1A',
            borderTopRightRadius: isUser ? 4 : 12,
            borderTopLeftRadius: isUser ? 12 : 4,
            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
          }}
        >
          <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {msg.text}
            {msg.streaming && <Text style={{ color: isUser ? 'rgba(255,255,255,.8)' : '#999' }}>▌</Text>}
          </Text>
          {msg.error && (
            <Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#F44336' }}>⚠️ {msg.error}</Text>
          )}
        </View>
      </View>
    )
  }

  return (
    <View className="ggc-page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#F6F7F9' }}>
      {/* 消息区 */}
      <ScrollView
        scrollY
        style={{ flex: 1, padding: '14px 16px 20px' }}
        scrollIntoView={`anchor-${scrollAnchor}`}
        scrollWithAnimation
      >
        {messages.map((m) => (
          <View key={m.id}>
            {renderBubble(m)}
            {m.role === 'assistant' && renderDishCard(m)}
          </View>
        ))}
        <View id={`anchor-${scrollAnchor}`} style={{ height: 1 }} />
      </ScrollView>

      {/* 快捷提问（仅初始、无对话时展示） */}
      {messages.length <= 1 && !busy && (
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 4px' }}>
          {SUGGESTIONS.map((s) => (
            <View
              key={s}
              onClick={() => onSend(s)}
              style={{ padding: '6px 12px', borderRadius: 16, background: '#fff', border: '1px solid #E0E0E0', fontSize: 12, color: '#555', cursor: 'pointer' }}
            >
              {s}
            </View>
          ))}
        </View>
      )}

      {/* 输入栏 */}
      <View style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fff', borderTop: '1px solid #EEEEEE' }}>
        <View style={{ flex: 1, display: 'flex', alignItems: 'center', height: 40, padding: '0 12px', borderRadius: 20, background: '#F2F3F5' }}>
          <Input
            style={{ flex: 1, height: 40, lineHeight: '40px', fontSize: 14 }}
            placeholder="告诉 AI 想吃什么…"
            value={input}
            confirmType="send"
            onConfirm={() => onSend()}
            onInput={(e: any) => setInput(String(e.detail?.value || ''))}
            disabled={busy}
            maxlength={500}
          />
        </View>
        <Button
          type="primary"
          size="small"
          style={{ borderRadius: 20, minWidth: 72 }}
          disabled={busy || !input.trim()}
          loading={busy}
          onClick={() => onSend()}
        >
          {busy ? '思考中' : '发送'}
        </Button>
      </View>
    </View>
  )
}

const qtyBtn = {
  width: 24, height: 24, borderRadius: '50%', background: '#F2F3F5', color: '#333',
  display: 'flex' as const, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14,
  flexShrink: 0,
}