import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { InputNumber, Button, Empty } from '@nutui/nutui-react-taro'

import { auth, dishes as dishApi, teams as teamApi, orders as orderApi } from '../../api'
import { store } from '../../store'
import { TeamCartSocket } from '../../utils/team_ws'

// 购物车/下单页——好好吃饭
// 列表（qty 调整/删除）+ 团队选择 + 团队多人合计 + 提交下单 → order-detail
export default function CartPage() {
  const [items, setItems] = useState<any[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [teams, setTeams] = useState<any[]>([])
  const [teamId, setTeamId] = useState('')
  const [teamCart, setTeamCart] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dishMap, setDishMap] = useState<Record<string, any>>({})

  const fmt = (n: number) => Number(n || 0).toFixed(2)

  const rebuild = (map: Record<string, any>) => {
    const cart = store.get('cart') || {}
    const list: any[] = []
    let amount = 0
    let count = 0
    Object.keys(cart).forEach((k) => {
      const qty = cart[k] || 0
      if (qty <= 0) return
      const d = map[k] || {}
      const price = Number(d.price) || 0
      list.push({
        dish_id: k,
        name: d.name || k,
        emoji: d.emoji || '🍽',
        color: d.color || '#E0E0E0',
        price,
        price_text: fmt(price),
        quantity: qty,
        total: price * qty,
        total_text: fmt(price * qty)
      })
      amount += price * qty
      count += qty
    })
    setItems(list)
    setTotalAmount(Math.round(amount * 100) / 100)
    setTotalCount(count)
  }

  useLoad(async () => {
    try {
      loadTeams()
      const dishRes: any = await dishApi.list()
      const map: Record<string, any> = {}
      ;(dishRes as any)?.items?.forEach((d: any) => { map[d.id] = d })
      setDishMap(map)
      setLoading(false)
      rebuild(map)
    } catch (e: any) {
      setDishMap({})
      setLoading(false)
      rebuild({})
    }
  })

  useDidShow(() => {
    rebuild(dishMap)
    loadTeams() // 从团队页创建/加入后返回时刷新团队列表
  })

  /** 拉取用户团队并同步当前选中团队（无选中则默认第一个） */
  const loadTeams = () => {
    return auth.me()
      .then((res: any) => {
        const ts = res?.user?.teams || []
        setTeams(ts)
        const storedId = store.get('currentTeamId')
        const cur = ts.find((t: any) => String(t.id) === String(storedId)) || ts[0] || null
        setTeamId(cur ? String(cur.id) : '')
        if (cur && String(cur.id) !== String(storedId)) store.set('currentTeamId', cur.id)
        if (cur) loadTeamCart(String(cur.id))
        else setTeamCart('')
        return cur ? String(cur.id) : ''
      })
      .catch(() => { setTeamCart(''); return '' })
  }

  const loadTeamCart = (tid?: string) => {
    const id = tid || teamId
    if (!id) return
    teamApi.cart(id)
      .then((res: any) => {
        const list = res?.items || []
        const userSet: Record<string, boolean> = {}
        let q = 0
        list.forEach((it: any) => {
          q += it.quantity || 0
          ;(it.user_ids || []).forEach((u: any) => { userSet[u] = true })
        })
        const p = Object.keys(userSet).length
        setTeamCart(p > 0 ? '团队共 ' + p + ' 人已点 ' + q + ' 份' : '')
      })
            .catch(() => setTeamCart(''))
  }

  const wsRef = useRef<TeamCartSocket | null>(null)

  // 三期：加入团队 WS 房间，同行加菜/清空时刷新汇总（实时防重复提示）
  useEffect(() => {
    const tid = teamId
    const token = auth.token()
    if (!tid || !token) {
      wsRef.current?.close()
      wsRef.current = null
      return
    }
    const ws = new TeamCartSocket(tid, token)
    ws.onMessage((e) => {
      if (['joined', 'cart.upsert', 'cart.clear', 'member.joined'].includes(e.event)) {
        loadTeamCart(tid)
      }
    })
    ws.connect()
    ws.send('join', {})
    wsRef.current = ws
    return () => ws.close()
  }, [teamId])

  const onTeamSelect = (id: string) => {
    setTeamId(id)
    store.set('currentTeamId', id)
    loadTeamCart(id)
  }

  const onQty = (dishId: string, v: any) => {
    store.setCartQuantity(dishId, Math.max(1, Number(v) || 1))
    rebuild(dishMap)
  }

  const onRemove = (dishId: string) => {
    store.setCartQuantity(dishId, 0)
    rebuild(dishMap)
    Taro.showToast({ title: '已删除', icon: 'none' })
  }

  const goMenu = () => Taro.switchTab({ url: '/pages/menu/index' })

  const onSubmit = () => {
    if (submitting) return
    if (!totalCount) {
      Taro.showToast({ title: '购物车是空的', icon: 'none' })
      return
    }
    if (!teamId) {
      Taro.showToast({ title: '请先选择下单团队', icon: 'none' })
      return
    }
    const payload = items.map((it) => ({ dish_id: it.dish_id, quantity: it.quantity }))
    setSubmitting(true)
    orderApi.create(teamId, payload)
      .then((order: any) => {
        store.set('cart', {})
        Taro.showToast({ title: '下单成功，取餐码 ' + order.pickup_code, icon: 'none' })
        setTimeout(() => {
          Taro.redirectTo({ url: '/pages/order-detail/index?id=' + order.id })
        }, 800)
      })
      .catch((e: any) => {
        Taro.showToast({ title: (e as any)?.message || '下单失败', icon: 'none' })
        setSubmitting(false)
      })
  }

  return (
    <View className="ggc-page" style={{ position: 'relative' }}>
      <View style={{ flex: 1, overflow: 'auto' }}>
        {items.length > 0 && (
          <>
            <View style={{ margin: '12px', padding: '14px', background: '#fff', borderRadius: '10px' }}>
              <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Text style={{ fontSize: '14px', color: '#666' }}>下单团队</Text>
                  {teams.length > 0 && (
                    <Text onClick={() => Taro.navigateTo({ url: '/pages/team-list/index' })}
                      style={{ fontSize: '12px', color: '#4CAF50', cursor: 'pointer', textDecoration: 'underline' }}>＋ 管理团队</Text>
                  )}
                </View>
                <View style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {teams.length === 0 && (
                    <View onClick={() => Taro.navigateTo({ url: '/pages/team-list/index' })}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '999px', fontSize: '13px', cursor: 'pointer', background: '#E8F5E9', color: '#4CAF50', fontWeight: 500 }}>
                      去创建/加入团队 ›
                    </View>
                  )}
                  {teams.map((t: any) => {
                    const active = String(t.id) === String(teamId)
                    return (
                      <View key={t.id} onClick={() => onTeamSelect(String(t.id))}
                        style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '13px', cursor: 'pointer', background: active ? '#4CAF50' : '#eee', color: active ? '#fff' : '#333' }}>
                        {t.name}
                      </View>
                    )
                  })}
                </View>
              </View>
              {teamCart ? <View style={{ color: '#FF9800', fontSize: '12px', marginTop: '8px' }}>{teamCart}</View> : null}
            </View>

            <View style={{ margin: '0 12px' }}>
              {items.map((it) => (
                <View key={it.dish_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <View style={{ width: '48px', height: '48px', borderRadius: '8px', background: it.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                    {it.emoji}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: '15px', fontWeight: 600, display: 'block' }}>{it.name}</Text>
                    <Text style={{ color: '#999', fontSize: '12px' }}>¥{it.price_text} / 份</Text>
                  </View>
                  <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <InputNumber value={it.quantity} min={1} onChange={(v: any) => onQty(it.dish_id, v)} />
                    <View style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <Text style={{ color: '#F44336', fontWeight: 600, fontSize: '14px' }}>¥{it.total_text}</Text>
                      <Text onClick={() => onRemove(it.dish_id)} style={{ color: '#999', fontSize: '12px', textDecoration: 'underline' }}>删除</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {items.length === 0 && !loading && (
          <View style={{ padding: '40px 0' }}>
            <Empty
              image={<Text style={{ fontSize: '48px' }}>🛒</Text>}
              description="购物车空空如也，去菜谱页挑几道菜吧"
              actions={[{ text: '去点菜', type: 'primary', onClick: goMenu }]}
            />
          </View>
        )}
      </View>

      {items.length > 0 && (
        <View style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#fff', borderTop: '1px solid #eee', flexShrink: 0 }}>
          <View>
            <Text style={{ fontSize: '12px', color: '#666' }}>合计</Text>
            <Text style={{ color: '#F44336', fontSize: '20px', fontWeight: 700 }}>¥{fmt(totalAmount)}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={{ color: '#999', fontSize: '12px' }}>共 {totalCount} 道</Text>
          <Button type="primary" size="small" style={{ fontSize: '14px' }} loading={submitting} onClick={onSubmit}>
            {submitting ? '提交中…' : '提交下单'}
          </Button>
        </View>
      )}
    </View>
  )
}
