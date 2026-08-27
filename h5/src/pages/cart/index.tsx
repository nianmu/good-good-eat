import { useEffect, useRef, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { Input, InputNumber, Button, Empty, Popup } from '@nutui/nutui-react-taro'

import { auth, dishes as dishApi, teams as teamApi, activities } from '../../api'
import { store } from '../../store'
import { TeamCartSocket } from '../../utils/team_ws'
import { requireLogin } from '../../utils/auth'
import { clearPendingActivity, getPendingActivity, getPendingActivityName } from '../../utils/pending-activity'

export default function CartPage() {
  const [items, setItems] = useState<any[]>([])
  const [, setTotalAmount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [teams, setTeams] = useState<any[]>([])
  const [teamId, setTeamId] = useState('')
  const [teamCart, setTeamCart] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dishMap, setDishMap] = useState<Record<string, any>>({})
  const [createVisible, setCreateVisible] = useState(false)
  const [createTeamId, setCreateTeamId] = useState('')
  const [createType, setCreateType] = useState<'daily' | 'party' | ''>('')
  const [createTeamSearch, setCreateTeamSearch] = useState('')
  const [pendingName, setPendingName] = useState('')

  const isPendingMode = () => getPendingActivity() !== null

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
        dish_id: k, name: d.name || k, emoji: d.emoji || '🍽', color: d.color || '#E0E0E0',
        price, price_text: fmt(price), quantity: qty, total: price * qty, total_text: fmt(price * qty)
      })
      amount += price * qty
      count += qty
    })
    setItems(list)
    setTotalAmount(Math.round(amount * 100) / 100)
    setTotalCount(count)
  }

  useLoad(async () => {
    setPendingName(getPendingActivityName())
    try {
      loadTeams()
      const dishRes: any = await dishApi.listAll()
      const map: Record<string, any> = {}
      ;(dishRes || []).forEach((d: any) => { map[d.id] = d })
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
    loadTeams()
    setPendingName(getPendingActivityName())
  })

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
    wsRef.current = ws
    return () => ws.close()
  }, [teamId])

  const onQty = (dishId: string, v: any) => {
    store.setCartQuantity(dishId, Math.max(1, Number(v) || 1))
    rebuild(dishMap)
  }

  const onRemove = (dishId: string) => {
    store.setCartQuantity(dishId, 0)
    rebuild(dishMap)
    showToast({ title: '已删除', icon: 'none' })
  }

  const goMenu = () => Taro.switchTab({ url: '/pages/menu/index' })

  const onSubmit = () => {
    if (!requireLogin('创建饭局需要登录')) return
    if (isPendingMode()) {
      doAddToExisting()
      return
    }
    if (!teams.length) {
      showToast({ title: '请先创建或加入团队', icon: 'none' })
      Taro.navigateTo({ url: '/pages/team-list/index' })
      return
    }
    setCreateTeamId(teamId || '')
    setCreateType('')
    setCreateVisible(true)
  }

  /** 为已有饭局加菜 */
  const doAddToExisting = async () => {
    const pending = getPendingActivity()
    const pendingId = pending?.id || ''
    const pname = pending?.name || '饭局'
    if (!pendingId) return
    if (!items.length) {
      showToast({ title: '购物车为空，先加几道菜', icon: 'none' })
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      for (const it of items) {
        await activities.addItem(pendingId, it.dish_id, Number(it.quantity))
      }
      store.set('cart', {})
      clearPendingActivity()
      showToast({ title: '已加入「' + pname + '」', icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({ url: '/pages/activity-detail/index?id=' + pendingId })
      }, 600)
    } catch (e: any) {
      showToast({ title: e?.message || '加入饭局失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  /** 创建新饭局 */
  const confirmJoin = async () => {
    if (!createTeamId) { showToast({ title: '请选择团队', icon: 'none' }); return }
    if (!createType) { showToast({ title: '请选择饭局类型', icon: 'none' }); return }
    if (submitting) return
    setSubmitting(true)
    try {
      let activityId: string | number = ''
      try {
        const listRes: any = await activities.list({ team_id: createTeamId, status: 'ordering' })
        const first = (listRes?.items || []).find((a: any) => String(a.type) === String(createType))
        if (first?.id) activityId = first.id
      } catch {}
      const isReuse = !!activityId
      if (!activityId) {
        const selTeam = teams.find((t: any) => String(t.id) === String(createTeamId))
        const typeLabel = createType === 'party' ? '聚餐饭局' : '日常饭局'
        const name = selTeam ? `${selTeam.name}·${typeLabel}` : typeLabel
        const created: any = await activities.create({ team_id: createTeamId, type: createType, name })
        activityId = created?.id ?? ''
        if (!activityId) throw new Error('创建饭局失败')
        store.set('currentTeamId', String(createTeamId))
      }
      for (const it of items) {
        await activities.addItem(activityId, it.dish_id, Number(it.quantity))
      }
      store.set('cart', {})
      setCreateVisible(false)
      clearPendingActivity()
      showToast({ title: isReuse ? '已加入饭局' : '饭局已创建', icon: 'success' })
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/activity-detail/index?id=' + activityId })
      }, 600)
    } catch (e: any) {
      showToast({ title: e?.message || '创建饭局失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="ggc-page" style={{ position: 'relative' }}>
      {/* 为已有饭局加菜横幅 */}
      {pendingName ? (
        <View style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#FFF8E1', borderBottom: '1px solid #FFE082' }}>
          <Text style={{ fontSize: '13px', color: '#FF9800', fontWeight: 600 }}>🍳 正在为「{pendingName}」加菜</Text>
          <Text style={{ flex: 1 }} />
          <Text onClick={() => {
            clearPendingActivity()
            setPendingName('')
          }} style={{ fontSize: '12px', color: '#F44336', cursor: 'pointer' }}>取消</Text>
        </View>
      ) : null}

      {/* 团队点菜统计 */}
      {teamCart && (
        <View style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--color-primary-bg)', borderBottom: '1px solid #C8E6C9' }}>
          <Text style={{ fontSize: '12px', color: '#388E3C', fontWeight: 600 }}>👥 {teamCart}</Text>
          <Text style={{ flex: 1 }} />
          <Text style={{ fontSize: 11, color: 'var(--color-text-placeholder)' }}>当前团队已点，可继续加</Text>
        </View>
      )}

      <View style={{ flex: 1, overflow: 'auto' }}>
        {items.length > 0 && (
          <View style={{ margin: '0 12px' }}>
            {items.map((it) => (
              <View key={it.dish_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <View style={{ width: '48px', height: '48px', borderRadius: '8px', background: it.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                  {it.emoji}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: '15px', fontWeight: 600, display: 'block' }}>{it.name}</Text>
                  {/* 价格暂不展示
                  <Text style={{ color: 'var(--color-text-placeholder)', fontSize: '12px' }}>¥{it.price_text} / 份</Text>
                  */}
                </View>
                <View style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                  <InputNumber value={it.quantity} min={1} onChange={(v: any) => onQty(it.dish_id, v)} />
                  <View style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {/* 价格暂不展示
                    <Text style={{ color: '#F44336', fontWeight: 600, fontSize: '14px' }}>¥{it.total_text}</Text>
                    */}
                    <Text onClick={() => onRemove(it.dish_id)} style={{ color: 'var(--color-text-placeholder)', fontSize: '12px', textDecoration: 'underline' }}>删除</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {items.length === 0 && !loading && (
          <View style={{ padding: '40px 0' }}>
            <Empty
              image={<Text style={{ fontSize: '48px' }}>🛒</Text>}
              description={pendingName ? '购物车空空的，去菜谱页挑几道菜加入饭局吧' : '购物车空空如也，去菜谱页挑几道菜吧'}
              actions={[{ text: '去点菜', type: 'primary', onClick: goMenu }]}
            />
          </View>
        )}
      </View>

      {items.length > 0 && (
        <View style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-divider)', flexShrink: 0 }}>
          {/* 价格暂不展示
          <View>
            <Text style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>合计</Text>
            <Text style={{ color: '#F44336', fontSize: '20px', fontWeight: 700 }}>¥{fmt(totalAmount)}</Text>
          </View>
          */}
          <View style={{ flex: 1 }} />
          <Text style={{ color: 'var(--color-text-placeholder)', fontSize: '12px' }}>共 {totalCount} 道</Text>
          <Button type="primary" size="small" style={{ fontSize: '14px' }} loading={submitting} onClick={onSubmit}>
            {pendingName ? '确认加入「' + pendingName + '」' : '创建饭局'}
          </Button>
        </View>
      )}

      {/* 发起饭局弹窗（团队+类型必选） */}
      <Popup visible={createVisible} position="bottom" round onClose={() => setCreateVisible(false)} title="发起饭局" style={{ maxHeight: '80vh', overflow: 'auto' }}>
        <View style={{ padding: '16px 16px 24px' }}>
          <View style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>选择团队 *</View>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', background: 'var(--color-bg-card)' }}>
            <Text style={{ color: 'var(--color-text-placeholder)', fontSize: 13 }}>🔍</Text>
            <Input placeholder="搜索团队" value={createTeamSearch} onChange={(v:string)=>setCreateTeamSearch(String(v||''))} style={{ flex: 1, fontSize: 13 }} />
            {!!createTeamSearch && <Text onClick={() => setCreateTeamSearch('')} style={{ color: 'var(--color-text-placeholder)', padding: '0 4px', cursor: 'pointer' }}>✕</Text>}
          </View>
          <View style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: '180px', overflow: 'auto' }}>
            {teams
              .filter((t:any) => !createTeamSearch || String(t.name).toLowerCase().includes(createTeamSearch.toLowerCase()))
              .map((t:any) => {
              const selected = String(t.id)===String(createTeamId)
              return (
                <View key={t.id} onClick={() => setCreateTeamId(String(t.id))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: selected ? '2px solid #4CAF50' : '1px solid var(--color-border)', background: selected ? 'var(--color-primary-bg)' : 'var(--color-bg-card)' }}>
                  <Text style={{ fontSize: 14, fontWeight: selected ? 600 : 400, color: selected ? '#388E3C' : 'var(--color-text-primary)' }}>{t.name}</Text>
                  {selected && <Text style={{ color: '#4CAF50' }}>✓</Text>}
                </View>
              )
            })}
            {teams.filter((t:any) => !createTeamSearch || String(t.name).toLowerCase().includes(createTeamSearch.toLowerCase())).length===0 && (
              <View style={{ padding: '12px', textAlign: 'center', color: 'var(--color-text-placeholder)', fontSize: 12 }}>无匹配团队</View>
            )}
            <View onClick={() => { setCreateVisible(false); Taro.navigateTo({ url: '/pages/team-list/index' }) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 14px', borderRadius: 8, border: '1px dashed var(--color-border)', color: '#4CAF50', fontSize: 13, cursor: 'pointer' }}>
              ＋ 去管理团队
            </View>
          </View>
          <View style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>饭局类型 *</View>
          <View style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {[
              { key: 'daily', label: '日常饭局', desc: '联动冰箱' },
              { key: 'party', label: '聚餐饭局', desc: '独立食材' },
            ].map((o) => (
              <View
                key={o.key}
                onClick={() => setCreateType(o.key as any)}
                style={{
                  flex: 1, padding: '14px 12px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                  border: createType === o.key ? '2px solid #4CAF50' : '1px solid var(--color-border)',
                  background: createType === o.key ? 'var(--color-primary-bg)' : 'var(--color-bg-card)',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: 600, color: createType === o.key ? '#388E3C' : 'var(--color-text-primary)' }}>{o.label}</Text>
                <Text style={{ display: 'block', fontSize: 11, color: 'var(--color-text-placeholder)', marginTop: 4 }}>{o.desc}</Text>
              </View>
            ))}
          </View>
          <Button type="primary" block loading={submitting} onClick={confirmJoin}>创建饭局</Button>
          <View style={{ fontSize: 11, color: 'var(--color-text-placeholder)', textAlign: 'center', marginTop: 8 }}>团队与类型均为必选</View>
        </View>
      </Popup>
    </View>
  )
}
