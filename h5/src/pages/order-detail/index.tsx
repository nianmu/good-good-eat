import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter, useLoad } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'

import { orders as orderApi } from '../../api'

// 订单详情页——好好吃饭
// 取餐码 + 步骤条 + 信息行 + 菜品清单 + 角色感知按钮
//
// 权限矩阵：
//   pending  → 下单人「发送给厨师」/ 厨师「接单」/ 成员「认领做菜」
//   accepted → 厨师「开始制作」
//   cooking  → 厨师「完成制作」
//   ready    → 厨师「上菜」/ 下单人「确认取餐」
//   completed → 「再次点菜」
//
// 「发送给厨师」3 种情况：
//   ① 无固定厨师 & 无人认领 → 提示先固定厨师或认领
//   ② 有固定厨师（无人认领）→ 确认发送给固定厨师
//   ③ 有固定厨师 & 有人认领 → 显示两人都可操作

const FLOW = ['pending', 'accepted', 'cooking', 'ready', 'completed']
const LABELS: Record<string, string> = {
  pending: '待接单', accepted: '已接单', cooking: '制作中', ready: '待取餐', completed: '已完成'
}
const STATUS_TEXT: Record<string, string> = {
  pending: '待接单', accepted: '已接单', cooking: '制作中', ready: '待取餐', completed: '已完成'
}

export default function OrderDetailPage() {
  const router = useRouter()
  const orderId = (router.params as any)?.id
  const [order, setOrder] = useState<any>(null)
  const [steps, setSteps] = useState<any[]>([])
  const [currentUserId, setCurrentUserId] = useState<number>(0)
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
        // 从本地存储获取当前用户 id
        const user = Taro.getStorageSync('ggc_user')
        setCurrentUserId(user?.id || 0)
      })
      .catch((e: any) => Taro.showToast({ title: (e as any)?.message || '加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  }

  useLoad(() => loadOrder())

  // 判断当前用户角色
  const isOwner = order && currentUserId === order.user_id  // 下单人
  const isOrderChef = order && order.chef_id && currentUserId === order.chef_id  // 认领/接单的厨师
  const isTeamChef = order && order.team_chef_id && currentUserId === order.team_chef_id  // 团队固定厨师
  const isChef = isOrderChef || isTeamChef  // 有效厨师
  const effectiveChefId = order?.effective_chef_id  // 有效厨师 id（认领人优先，其次固定厨师）

  // ===== 「发送给厨师」逻辑（pending 状态，下单人视角）=====
  const onSendToChef = () => {
    if (submitting || !order) return

    const teamChefId = order.team_chef_id
    const orderChefId = order.chef_id
    const teamChefName = order.team_chef_nickname
    const orderChefName = order.chef_nickname

    // 情况①：无固定厨师 & 无人认领
    if (!teamChefId && !orderChefId) {
      Taro.showModal({
        title: '暂无厨师',
        content: '当前团队没有固定厨师，且无人认领做菜。\n\n请先在团队中指定厨师，或让成员认领做菜后再发送。',
        confirmText: '去团队',
        cancelText: '知道了',
        success(res) {
          if (res.confirm) {
            Taro.navigateTo({ url: `/pages/team-detail/index?id=${order.team_id}` })
          }
        }
      })
      return
    }

    // 情况③：有固定厨师 & 有人认领（且不是同一人）
    if (teamChefId && orderChefId && teamChefId !== orderChefId) {
      Taro.showModal({
        title: '确认发送',
        content: `当前厨师：\n🏠 固定厨师：${teamChefName || '未知'}\n👨‍🍳 认领人：${orderChefName || '未知'}\n\n确定发送订单？`,
        success(res) {
          if (res.confirm) doSendToChef()
        }
      })
      return
    }

    // 情况②：有固定厨师（无人认领，或认领人=固定厨师）
    const chefName = orderChefName || teamChefName || '未知'
    Taro.showModal({
      title: '确认发送',
      content: `当前厨师为「${chefName}」，确定发送订单？`,
      success(res) {
        if (res.confirm) doSendToChef()
      }
    })
  }

  const doSendToChef = () => {
    if (!order) return
    setSubmitting(true)
    orderApi.accept(order.id)
      .then(() => {
        Taro.showToast({ title: '已发送，等待厨师接单', icon: 'none' })
        setSubmitting(false)
        loadOrder()
      })
      .catch((e: any) => {
        Taro.showToast({ title: (e as any)?.message || '发送失败', icon: 'none' })
        setSubmitting(false)
      })
  }

  // ===== 认领做菜 =====
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

  // ===== 厨师推进状态（accepted→cooking→ready→completed）=====
  const onChefProgress = (target: string, toast: string) => {
    if (submitting || !order) return
    setSubmitting(true)
    orderApi.status(order.id, target)
      .then(() => {
        Taro.showToast({ title: toast, icon: 'none' })
        setSubmitting(false)
        loadOrder()
      })
      .catch((e: any) => {
        Taro.showToast({ title: (e as any)?.message || '操作失败', icon: 'none' })
        setSubmitting(false)
      })
  }

  // ===== 下单人确认取餐（ready→completed）=====
  const onConfirmPickup = () => {
    if (submitting || !order) return
    setSubmitting(true)
    orderApi.status(order.id, 'completed')
      .then(() => {
        Taro.showToast({ title: '取餐成功，祝用餐愉快！', icon: 'none' })
        setSubmitting(false)
        loadOrder()
      })
      .catch((e: any) => {
        Taro.showToast({ title: (e as any)?.message || '操作失败', icon: 'none' })
        setSubmitting(false)
      })
  }

  // ===== 构建底部按钮 =====
  const renderActions = () => {
    if (!order) return null
    const status: string = order.status

    // 已完成：再次点菜
    if (status === 'completed') {
      return (
        <Button type="primary" size="small" style={{ flex: 1, fontSize: '13px' }}
          onClick={() => Taro.switchTab({ url: '/pages/menu/index' })}>
          🍽 再次点菜
        </Button>
      )
    }

    const buttons: JSX.Element[] = []

    // 认领按钮：pending 状态 & 无固定厨师 & 当前用户不是下单人 & 当前用户未认领
    if (status === 'pending' && !order.team_chef_id && !isOwner && !isOrderChef) {
      buttons.push(
        <Button key="claim" fill="outline" size="small"
          style={{ fontSize: '13px', color: '#FF9800' }}
          disabled={submitting} onClick={onClaim}>
          👨‍🍳 认领做菜
        </Button>
      )
    }

    // pending 状态：下单人看「发送给厨师」，厨师看「接单」
    if (status === 'pending') {
      if (isOwner && !isChef) {
        // 下单人（非厨师）：发送给厨师
        buttons.push(
          <Button key="send" type="primary" size="small"
            style={{ flex: 1.5, fontSize: '13px' }}
            loading={submitting} onClick={onSendToChef}>
            📤 发送给厨师
          </Button>
        )
      } else if (isChef) {
        // 厨师：接单
        buttons.push(
          <Button key="accept" type="primary" size="small"
            style={{ flex: 1.5, fontSize: '13px' }}
            loading={submitting} onClick={doSendToChef}>
            ✅ 接单
          </Button>
        )
      } else {
        // 非下单人非厨师：等待中
        buttons.push(
          <Button key="wait" size="small" disabled
            style={{ flex: 1.5, fontSize: '13px' }}>
            ⏳ 等待厨师接单
          </Button>
        )
      }
    }

    // accepted / cooking：只有厨师能推进
    if (status === 'accepted' && isChef) {
      buttons.push(
        <Button key="cook" type="primary" size="small"
          style={{ flex: 1.5, fontSize: '13px' }}
          loading={submitting}
          onClick={() => onChefProgress('cooking', '已开始制作')}>
          🔥 开始制作
        </Button>
      )
    }
    if (status === 'accepted' && !isChef) {
      buttons.push(
        <Button key="wait" size="small" disabled
          style={{ flex: 1.5, fontSize: '13px' }}>
          ⏳ 厨师准备中
        </Button>
      )
    }

    if (status === 'cooking' && isChef) {
      buttons.push(
        <Button key="done" type="primary" size="small"
          style={{ flex: 1.5, fontSize: '13px' }}
          loading={submitting}
          onClick={() => onChefProgress('ready', '已完成制作，可以上菜了')}>
          ✅ 完成制作
        </Button>
      )
    }
    if (status === 'cooking' && !isChef) {
      buttons.push(
        <Button key="wait" size="small" disabled
          style={{ flex: 1.5, fontSize: '13px' }}>
          🔥 制作中…
        </Button>
      )
    }

    // ready：厨师「上菜」，下单人「确认取餐」
    if (status === 'ready' && isChef) {
      buttons.push(
        <Button key="serve" type="primary" size="small"
          style={{ flex: 1.5, fontSize: '13px' }}
          loading={submitting}
          onClick={() => onChefProgress('completed', '上菜成功！')}>
          🍽 上菜
        </Button>
      )
    }
    if (status === 'ready' && isOwner && !isChef) {
      buttons.push(
        <Button key="pickup" type="primary" size="small"
          style={{ flex: 1.5, fontSize: '13px' }}
          loading={submitting} onClick={onConfirmPickup}>
          ✅ 确认取餐
        </Button>
      )
    }
    if (status === 'ready' && !isChef && !isOwner) {
      buttons.push(
        <Button key="wait" size="small" disabled
          style={{ flex: 1.5, fontSize: '13px' }}>
          🍽 待取餐
        </Button>
      )
    }

    // 复制按钮始终显示
    buttons.push(
      <Button key="copy" fill="none" size="small"
        style={{ flex: 1, fontSize: '13px', background: '#F5F5F5' }}
        disabled={submitting} onClick={onCopy}>
        📋 复制
      </Button>
    )

    return buttons
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

  // 厨师信息展示
  const chefDisplay = (() => {
    const names: string[] = []
    if (order.team_chef_nickname) names.push(`🏠 ${order.team_chef_nickname}`)
    if (order.chef_nickname && order.chef_id !== order.team_chef_id) {
      names.push(`👨‍🍳 ${order.chef_nickname}`)
    }
    return names.length > 0 ? names.join('、') : '待认领'
  })()

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
            ['厨师', chefDisplay],
            ['下单时间', order.created_at || '—']
          ].map(([k, v], i, arr) => (
            <View key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
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
                <View style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Text style={{ color: '#999', fontSize: '12px' }}>单价 ¥{fmt(it.price)}</Text>
                  {it.user_nickname && (
                    <Text style={{ color: '#4CAF50', fontSize: '11px', background: '#E8F5E9', padding: '1px 6px', borderRadius: '999px' }}>
                      {(it.user_avatar || '👤') + ' ' + it.user_nickname}
                    </Text>
                  )}
                </View>
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
        {renderActions()}
      </View>
    </View>
  )
}
