import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter, useLoad } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'

import { orders as orderApi } from '../../api'

// 订单详情页——好好吃饭
// 绿色取餐码大字 + 五步状态 + 信息行 + 菜品清单 + 合计 + 主按钮推进 + 复制
const FLOW = ['pending', 'accepted', 'cooking', 'ready', 'completed']
const LABELS: Record<string, string> = {
  pending: '待接单', accepted: '已接单', cooking: '制作中', ready: '待取餐', completed: '已完成'
}
const ACTIONS: Record<string, { label: string; toast: string }> = {
  pending: { label: '发送给厨师', toast: '已发送给厨师，等待接单' },
  accepted: { label: '开始制作', toast: '已开始制作' },
  cooking: { label: '完成制作', toast: '已完成制作，可凭码取餐' },
  ready: { label: '确认取餐', toast: '取餐成功，祝用餐愉快！' },
  completed: { label: '再次点菜', toast: '' }
}
const STATUS_TEXT: Record<string, string> = {
  pending: '待接单', accepted: '已接单', cooking: '制作中', ready: '待取餐', completed: '已完成'
}

export default function OrderDetailPage() {
  const router = useRouter()
  const orderId = (router.params as any)?.id
  const [order, setOrder] = useState<any>(null)
  const [steps, setSteps] = useState<any[]>([])
  const [actionLabel, setActionLabel] = useState('再次点菜')
  const [canClaim, setCanClaim] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const fmt = (n: any) => Number(n || 0).toFixed(2)

  const buildSteps = (status: string) => {
    const idx = FLOW.indexOf(status)
    return FLOW.map((s, i) => ({
      key: s,
      label: LABELS[s],
      dot: i < idx ? '✓' : String(i + 1),
      done: i < idx,
      current: i === idx
    }))
  }

  const loadOrder = () => {
    if (!orderId) {
      setLoading(false)
      return
    }
    setLoading(true)
    orderApi.detail(orderId)
      .then((o: any) => {
        setOrder(o)
        setSteps(buildSteps(o.status))
        setActionLabel((ACTIONS[o.status] || {}).label || '再次点菜')
        setCanClaim(o.status === 'pending' && !o.chef_id)
      })
      .catch((e: any) => Taro.showToast({ title: (e as any)?.message || '加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  }

  useLoad(() => loadOrder())

  const onPrimary = () => {
    if (submitting || !order) return
    const id = order.id
    const status: string = order.status
    if (status === 'completed') {
      Taro.switchTab({ url: '/pages/menu/index' })
      return
    }
    const action = ACTIONS[status] || {}
    let p: Promise<any> | null = null
    if (status === 'pending') p = orderApi.accept(id)
    else if (status === 'accepted') p = orderApi.status(id, 'cooking')
    else if (status === 'cooking') p = orderApi.status(id, 'ready')
    else if (status === 'ready') p = orderApi.status(id, 'completed')
    if (!p) return
    setSubmitting(true)
    p.then(() => {
      Taro.showToast({ title: action.toast || '已更新', icon: 'none' })
      setSubmitting(false)
      loadOrder()
    }).catch((e: any) => {
      Taro.showToast({ title: (e as any)?.message || '操作失败', icon: 'none' })
      setSubmitting(false)
    })
  }

  const onClaim = () => {
    if (submitting || !order) return
    setSubmitting(true)
    orderApi.claim(order.id)
      .then(() => {
        Taro.showToast({ title: '已认领做菜，加油！', icon: 'none' })
        setSubmitting(false)
        loadOrder()
      })
      .catch((e: any) => {
        Taro.showToast({ title: (e as any)?.message || '认领失败', icon: 'none' })
        setSubmitting(false)
      })
  }

  const buildOrderText = () => {
    if (!order) return ''
    const lines: string[] = []
    lines.push('【好好吃饭·取餐码】' + order.pickup_code)
    lines.push('团队：' + (order.team_name || '—'))
    lines.push('点餐人：' + (order.user_nickname || '—'))
    lines.push('下单时间：' + (order.created_at || '—'))
    lines.push('————————————')
    ;(order.items || []).forEach((i: any) => {
      lines.push(i.name + ' ×' + i.quantity + '  ¥' + fmt((Number(i.price) || 0) * i.quantity))
    })
    lines.push('————————————')
    lines.push('共 ' + order.total_count + ' 道 · 合计 ¥' + fmt(order.total_amount))
    return lines.join('\n')
  }

  const onCopy = () => {
    const text = buildOrderText()
    if (!text) return
    Taro.setClipboardData({ data: text })
      .then(() => Taro.showToast({ title: '已复制订单信息，去微信群粘贴吧', icon: 'none' }))
      .catch(() => Taro.showToast({ title: '复制失败', icon: 'none' }))
  }

  const goOrders = () => Taro.switchTab({ url: '/pages/orders/index' })

  if (loading) {
    return <View style={{ padding: '40px', textAlign: 'center', color: '#999' }}>加载中…</View>
  }
  if (!order) {
    return (
      <View style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
        <Text style={{ fontSize: '40px' }}>📦</Text>
        <View>订单不存在或已删除</View>
        <Button type="primary" size="small" style={{ marginTop: '16px' }} onClick={goOrders}>查看我的订单</Button>
      </View>
    )
  }

  const items = order.items || []

  return (
    <View className="ggc-page" style={{ position: 'relative' }}>
      <View style={{ flex: 1, overflow: 'auto', paddingBottom: '12px' }}>
        {/* 订单状态 + 步骤条 */}
        <View style={{ margin: '12px', padding: '14px', background: '#fff', borderRadius: '10px' }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <Text style={{ fontSize: '15px', fontWeight: 600 }}>订单状态</Text>
            <View style={{ padding: '3px 10px', borderRadius: '999px', background: '#E8F5E9', color: '#388E3C', fontSize: '12px' }}>
              {STATUS_TEXT[order.status] || order.status}
            </View>
          </View>
          <View style={{ display: 'flex', alignItems: 'flex-start' }}>
            {steps.map((s, i) => (
              <View key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <View style={{
                  width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', background: s.done ? '#4CAF50' : (s.current ? '#4CAF50' : '#eee'),
                  color: s.done || s.current ? '#fff' : '#999'
                }}>{s.dot}</View>
                <Text style={{ fontSize: '11px', color: s.current ? '#388E3C' : '#999', marginTop: '6px', textAlign: 'center' }}>{s.label}</Text>
                {i < steps.length - 1 && (
                  <View style={{ position: 'absolute', left: '50%', top: '13px', width: '100%', height: '2px', background: s.done ? '#4CAF50' : '#eee' }} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* 取餐码主卡片 */}
        <View style={{ margin: '12px', padding: '22px', background: 'linear-gradient(135deg,#4CAF50,#388E3C)', borderRadius: '12px', textAlign: 'center', color: '#fff' }}>
          <View style={{ fontSize: '13px', opacity: .9, letterSpacing: 2 }}>取 餐 码</View>
          <View style={{ fontSize: '52px', fontWeight: 800, letterSpacing: 6, margin: '8px 0' }}>{order.pickup_code}</View>
          <View style={{ fontSize: '12px', opacity: .85 }}>厨师做完凭码喊你 · 如「{order.pickup_code} 好了」</View>
        </View>

        {/* 信息行 */}
        <View style={{ margin: '12px', padding: '6px 14px', background: '#fff', borderRadius: '10px' }}>
          {[
            ['点餐团队', order.team_name || '—'],
            ['点餐人', (order.user_avatar || '👤') + ' ' + (order.user_nickname || '—')],
            ['下单时间', order.created_at || '—']
          ].map(([k, v], i) => (
            <View key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < 2 ? '1px solid #f0f0f0' : 'none' }}>
              <Text style={{ color: '#666', fontSize: '14px' }}>{k}</Text>
              <Text style={{ fontSize: '14px', color: '#333' }}>{v}</Text>
            </View>
          ))}
        </View>

        {/* 菜品清单 */}
        <View style={{ margin: '12px', padding: '14px', background: '#fff', borderRadius: '10px' }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <Text style={{ fontSize: '15px', fontWeight: 600 }}>菜品清单</Text>
            <Text style={{ color: '#999', fontSize: '12px' }}>共 {items.length} 种</Text>
          </View>
          {items.map((it: any) => (
            <View key={it.dish_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
              <View style={{ width: '40px', height: '40px', borderRadius: '8px', background: it.color || '#E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                {it.emoji || '🍽'}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: '15px', fontWeight: 500, display: 'block' }}>{it.name}</Text>
                <Text style={{ color: '#999', fontSize: '12px' }}>单价 ¥{fmt(it.price)}</Text>
              </View>
              <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <Text style={{ fontSize: '13px', color: '#666' }}>×{it.quantity}</Text>
                <Text style={{ fontSize: '14px', color: '#F44336', fontWeight: 600 }}>¥{fmt((Number(it.price) || 0) * it.quantity)}</Text>
              </View>
            </View>
          ))}
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px' }}>
            <Text style={{ color: '#666', fontSize: '14px' }}>共 {order.total_count} 道</Text>
            <Text style={{ color: '#F44336', fontSize: '18px', fontWeight: 700 }}>¥{fmt(order.total_amount)}</Text>
          </View>
        </View>
      </View>

      {/* 底部操作栏 */}
      <View style={{ display: 'flex', gap: '8px', padding: '10px 16px', background: '#fff', borderTop: '1px solid #eee', flexShrink: 0 }}>
        {canClaim && (
          <Button fill="outline" size="small" style={{ flex: 1, fontSize: '13px', color: '#FF9800' }} disabled={submitting} onClick={onClaim}>
            👨‍🍳 认领做菜
          </Button>
        )}
        <Button fill="none" size="small" style={{ flex: 1, fontSize: '13px', background: '#F5F5F5' }} disabled={submitting} onClick={onCopy}>
          📋 复制订单信息
        </Button>
        <Button type="primary" size="small" style={{ flex: 1.5, fontSize: '13px' }} loading={submitting} onClick={onPrimary}>
          {submitting ? '处理中…' : actionLabel}
        </Button>
      </View>
    </View>
  )
}
