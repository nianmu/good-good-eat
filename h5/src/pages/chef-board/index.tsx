/**
 * 厨师看板（三期）——好好吃饭 跨端 H5
 * - 顶部聚合卡：待做订单数 / 按菜合并（菜名 xN + 食材）/ 食材汇总
 * - 订单列表：取餐码/状态/下单人/菜品摘要；按状态推进（接单→开始制作→完成制作→确认取餐）
 * - 数据走 chef.orders / chef.orders/aggregated
 * 对齐原生小程序 pages/chef-board。
 */
import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { Button, Empty, Skeleton } from '@nutui/nutui-react-taro'
import { chef, orders, guestLogin } from '../../api'
import StatusTag from '../../components/status-tag'
import { formatTime, dishSummary } from '../../utils/format'

const STATUS_ACTION: Record<string, { label: string; act: string; status?: string }> = {
  pending: { label: '接单', act: 'accept' },
  accepted: { label: '开始制作', act: 'status', status: 'cooking' },
  cooking: { label: '完成制作', act: 'status', status: 'ready' },
  ready: { label: '确认取餐', act: 'status', status: 'completed' }
}

function normalize(o: any) {
  const act = STATUS_ACTION[o.status]
  return {
    id: o.id,
    pickup_code: o.pickup_code,
    status: o.status,
    user_nickname: o.user ? o.user.nickname : '',
    summary: dishSummary(o.items),
    time_text: formatTime(o.created_at),
    action_label: act ? act.label : ''
  }
}

export default function ChefBoardPage() {
  const [loading, setLoading] = useState(true)
  const [ordersState, setOrders] = useState<any[]>([])
  const [ordersCount, setOrdersCount] = useState(0)
  const [dishes, setDishes] = useState<any[]>([])
  const [ingredients, setIngredients] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      await guestLogin().catch(() => null)
      const [orderRes, agg]: any[] = await Promise.all([chef.orders(), chef.aggregated()])
      setOrders((orderRes?.items || []).map(normalize))
      setOrdersCount((agg && agg.orders_count) || 0)
      setDishes((agg && agg.dishes) || [])
      setIngredients((agg && agg.ingredients) || [])
      setLoading(false)
      setRefreshing(false)
    } catch (e: any) {
      showToast({ title: e?.message || '加载失败', icon: 'none' })
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDidShow(() => {
    loadAll()
  })

  function onOrderTap(id: number | string) {
    Taro.navigateTo({ url: '/pages/order-detail/index?id=' + id })
  }

  async function onAction(id: number | string) {
    const order = ordersState.find((o) => o.id === id)
    if (!order) return
    const act = STATUS_ACTION[order.status]
    if (!act || submitting) return
    setSubmitting(true)
    try {
      if (act.act === 'accept') {
        await orders.accept(id)
      } else {
        await orders.status(id, act.status as string)
      }
      showToast({ title: act.label + '成功', icon: 'none' })
      await loadAll()
    } catch (e: any) {
      showToast({ title: e?.message || '操作失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScrollView
      scrollY
      refresherEnabled
      refresherTriggered={refreshing}
      onRefresherRefresh={() => { setRefreshing(true); loadAll() }}
      style={{ height: '100vh', background: 'var(--color-bg-page)' }}
    >
      {loading ? (
        <View style={{ padding: 16 }}>
          <Skeleton rows={3} animated />
          <Skeleton rows={3} animated />
        </View>
      ) : (
        <View style={{ padding: 12 }}>
          {/* 聚合卡 */}
          <View style={{ background: 'linear-gradient(135deg,#4CAF50 0%,#388E3C 100%)', borderRadius: 16, padding: 14, color: '#fff', boxShadow: '0 2px 8px rgba(76,175,80,0.35)' }}>
            <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: 600 }}>今日待做</Text>
              <View style={{ fontSize: 13, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 999 }}>{ordersCount} 单</View>
            </View>

            {dishes.length > 0 && (
              <View style={{ marginTop: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 8 }}>
                <View style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>按菜合并</View>
                {dishes.map((d: any) => (
                  <View key={d.dish_name + d.total_quantity} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13 }}>
                    <Text>{d.emoji}</Text>
                    <Text style={{ flex: 1 }}>{d.dish_name}</Text>
                    <Text style={{ fontWeight: 700 }}>×{d.total_quantity}</Text>
                  </View>
                ))}
              </View>
            )}

            {ingredients.length > 0 && (
              <View style={{ marginTop: 8, background: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 8 }}>
                <View style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>食材汇总</View>
                <View style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ingredients.map((ing: any, idx: number) => (
                    <View key={(ing.name || '') + idx} style={{ fontSize: 12, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: 999 }}>
                      {ing.name} ×{ing.count}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {dishes.length === 0 && ingredients.length === 0 && (
              <View style={{ fontSize: 13, padding: 8, textAlign: 'center', opacity: 0.9 }}>🍳 暂无待做订单</View>
            )}
          </View>

          {/* 订单列表 */}
          <View style={{ margin: '16px 2px 8px', fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            收到的订单（{ordersState.length}）
          </View>

          {ordersState.length === 0 ? (
            <View style={{ paddingTop: 24 }}>
              <Empty description="你还没有收到订单" status="order" />
            </View>
          ) : (
            ordersState.map((o) => (
              <View
                key={o.id}
                onClick={() => onOrderTap(o.id)}
                style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: 12, marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 20, fontWeight: 700, color: '#388E3C' }}>{o.pickup_code}</Text>
                  <StatusTag status={o.status} />
                  <Text style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-placeholder)' }}>{o.time_text}</Text>
                </View>
                <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <Text style={{ flex: 1 }}>{o.summary}</Text>
                  <Text style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{o.user_nickname} 点的</Text>
                </View>
                <View style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {o.action_label ? (
                    <Button size="small" type="primary" loading={submitting} onClick={(e) => { e.stopPropagation(); onAction(o.id) }}>
                      {o.action_label}
                    </Button>
                  ) : (
                    <Text style={{ fontSize: 13, color: 'var(--color-text-placeholder)' }}>已完成</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  )
}
