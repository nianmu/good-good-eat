import { useState } from 'react'
import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useLoad, useDidShow, useShareAppMessage } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { Input, Button, Popup, Empty } from '@nutui/nutui-react-taro'

import { auth, guestLogin, dishes as dishApi, categories as catApi, favorites as favApi, plans, activities } from '../../api'
import { mediaUrl } from '../../api/config'
import { store } from '../../store'
import { requireLogin } from '../../utils/auth'
import { clearPendingActivity, getPendingActivity, getPendingActivityName } from '../../utils/pending-activity'

// 菜谱主页——好好吃饭（跨端 H5）
// 分类 + 搜索 + 菜品（emoji 色块/评分/价格/加购）+ 收藏 + 随机点菜 + 惊喜推荐 + 今天吃什么弹层
const GREENS = { primary: '#4CAF50', primaryDark: '#388E3C', primaryBg: '#E8F5E9' }

export default function MenuPage() {
  const [user, setUser] = useState<any>({ avatar: '👤', nickname: '好好吃饭' })
  const [teams, setTeams] = useState<any[]>([])
  const [currentTeamId, setCurrentTeamId] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState('')
  const [allDishes, setAllDishes] = useState<any[]>([])
  const [dishes, setDishes] = useState<any[]>([])
  const [keyword, setKeyword] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [cartCount, setCartCount] = useState(0)
  const [favoritedMap, setFavoritedMap] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [randomLoading, setRandomLoading] = useState(false)
  const [recommendVisible, setRecommendVisible] = useState(false)
  const [recommendLoading, setRecommendLoading] = useState(false)
  const [recommend, setRecommend] = useState<any>(null)
  const [peopleText, setPeopleText] = useState('3')
  const [createVisible, setCreateVisible] = useState(false)
  const [createTeamId, setCreateTeamId] = useState('')
  const [createType, setCreateType] = useState<'daily' | 'party' | ''>('')
  const [createTeamSearch, setCreateTeamSearch] = useState('')
  const [joining, setJoining] = useState(false)
  const [pendingName, setPendingName] = useState('')

  const isPendingMode = () => getPendingActivity() !== null

  const syncCart = () => {
    const c = store.get('cart') || {}
    setCart(c)
    setCartCount(Object.keys(c).reduce((a, k) => a + (c[k] || 0), 0))
  }

  const loadFavorites = () => {
    favApi.list()
      .then((res: any) => {
        const map: Record<string, boolean> = {}
        ;(res.items || []).forEach((d: any) => { map[d.id] = true })
        setFavoritedMap(map)
      })
      .catch(() => {})
  }

  const loadUser = () => {
    auth.me()
      .then((res: any) => {
        const u = res?.user
        if (!u) return
        store.set('user', u)
        setUser(u)
        const ts = u.teams || []
        const storedId = store.get('currentTeamId')
        const cur = ts.find((t: any) => String(t.id) === String(storedId)) || ts[0] || null
        if (cur && String(cur.id) !== String(storedId)) store.set('currentTeamId', cur.id)
        setTeams(ts)
        setCurrentTeamId(cur ? cur.id : '')
      })
      .catch(() => {})
  }

  const applyFilter = (all: any[], catId: string, kw: string) => {
    const k = (kw || '').trim()
    let list = all
    if (k) {
      list = all.filter((d: any) =>
        (d.name || '').indexOf(k) >= 0 ||
        (d.description || '').indexOf(k) >= 0 ||
        ((d.ingredients || []) as string[]).some((i) => i.indexOf(k) >= 0)
      )
    } else if (catId) {
      list = all.filter((d: any) => String(d.category_id) === String(catId))
    }
    setDishes(list)
  }

  useLoad(async () => {
    // 恢复 pending 饭局名
    setPendingName(getPendingActivityName())
    try {
      await guestLogin().catch(() => null)
      loadUser()
      const [catRes, dishRes] = await Promise.all([catApi.list(), dishApi.listAll()])
      const cats = catRes || []
      const all = dishRes || []
      cats.forEach((c: any) => {
        c.count = all.filter((d: any) => String(d.category_id) === String(c.id)).length
      })
      setCategories(cats)
      setAllDishes(all)
      const first = cats[0] || null
      setActiveCategoryId(first ? first.id : '')
      setLoading(false)
      applyFilter(all, first ? first.id : '', keyword)
    } catch (e: any) {
      showToast({ title: e?.message || '加载失败', icon: 'none' })
      setLoading(false)
    }
  })

  useDidShow(() => {
    syncCart()
    loadFavorites()
    loadUser()
    setPendingName(getPendingActivityName())
  })

  useShareAppMessage(() => {
    const team = teams.find((t: any) => String(t.id) === String(currentTeamId))
    const code = team?.invite_code
    return {
      title: code ? `「${team.name}」邀请你一起点菜` : '好好吃饭，一起点菜吧',
      path: code ? `/pages/welcome/index?invite_code=${code}` : '/pages/welcome/index',
    }
  })

  const onSearch = (v: string) => {
    setKeyword(v)
    const k = (v || '').trim()
    if (k) {
      applyFilter(allDishes, '', v)
    } else {
      applyFilter(allDishes, activeCategoryId, '')
    }
  }

  const clearSearch = () => {
    setKeyword('')
    applyFilter(allDishes, activeCategoryId, '')
  }

  const onCategoryTap = (id: string) => {
    setActiveCategoryId(id)
    setKeyword('')
    applyFilter(allDishes, id, '')
  }

  const onDishTap = (d: any) => {
    Taro.navigateTo({ url: '/pages/dish-detail/index?id=' + d.id })
  }

  const setQty = (id: number, qty: number) => {
    const next = Math.max(0, qty)
    store.setCartQuantity(id, next)
    const c = { ...cart, [id]: next }
    if (next <= 0) delete c[id]
    setCart(c)
    setCartCount(Object.keys(c).reduce((a, k) => a + (c[k] || 0), 0))
  }

  const addCart = (id: number) => setQty(id, (cart[id] || 0) + 1)
  const minusCart = (id: number) => setQty(id, (cart[id] || 0) - 1)

  const replaceCart = (picks: any[]) => {
    const c: Record<string, number> = {}
    picks.forEach((d: any) => { c[d.id] = (c[d.id] || 0) + 1 })
    store.set('cart', c)
    setCart(c)
    setCartCount(Object.keys(c).reduce((a, k) => a + (c[k] || 0), 0))
  }

  const onFavorite = (d: any) => {
    const cur = !!favoritedMap[d.id]
    const next = !cur
    ;(cur ? favApi.remove(d.id) : favApi.toggle(d.id))
      .then(() => {
        const map = { ...favoritedMap }
        if (next) map[d.id] = true; else delete map[d.id]
        setFavoritedMap(map)
        if (cur) showToast({ title: '已取消收藏', icon: 'none' })
      })
      .catch((e: any) => showToast({ title: (e as any)?.message || '操作失败', icon: 'none' }))
  }

  const onSurprise = () => {
    if (randomLoading) return
    setRandomLoading(true)
    dishApi.random(3, 'surprise')
      .then((res: any) => {
        const picks = res || []
        if (!picks.length) {
          showToast({ title: '暂无可推荐的菜品', icon: 'none' })
          return
        }
        replaceCart(picks)
        showToast({ title: '惊喜：' + picks.map((d: any) => d.name).join('、'), icon: 'none' })
      })
      .catch((e: any) => showToast({ title: (e as any)?.message || '推荐失败', icon: 'none' }))
      .finally(() => setRandomLoading(false))
  }

  const onRecommendLoad = () => {
    const people = parseInt(peopleText, 10) || 3
    setRecommendLoading(true)
    setRecommend(null)
    dishApi.recommend(Math.max(1, Math.min(20, people)))
      .then((res: any) => setRecommend(res))
      .catch((e: any) => showToast({ title: (e as any)?.message || '推荐失败', icon: 'none' }))
      .finally(() => setRecommendLoading(false))
  }

  const onRecommendAddAll = () => {
    const plan = (recommend && recommend.plan) || []
    if (!plan.length) return
    replaceCart(plan)
    setRecommendVisible(false)
    setRecommend(null)
    showToast({ title: '已加入购物车', icon: 'none' })
  }

  const onRecommendSavePlan = () => {
    const plan = (recommend && recommend.plan) || []
    if (!plan.length) return
    const reason = recommend?.reason || ''
    plans.create({
      name: reason || '今天吃什么',
      note: reason,
      items: plan.map((d: any) => ({ dish_id: d.id, quantity: 1 }))
    }).then(() => {
      showToast({ title: '已保存为今日计划（' + plan.length + ' 道）', icon: 'success' })
    }).catch((e: any) => {
      showToast({ title: e?.message || '保存失败', icon: 'none' })
    })
    setRecommendVisible(false)
    setRecommend(null)
  }

  // ---- 底部按钮逻辑 ----
  const onSubmit = () => {
    if (!requireLogin('操作需要登录')) return
    if (isPendingMode()) {
      doAddToExisting()
      return
    }
    if (!teams.length) {
      showToast({ title: '请先创建或加入团队', icon: 'none' })
      Taro.navigateTo({ url: '/pages/team-list/index' })
      return
    }
    setCreateTeamId(currentTeamId || '')
    setCreateType('')
    setCreateVisible(true)
  }

  /** 为已有饭局加菜（跳转自饭局详情"去加菜"） */
  const doAddToExisting = async () => {
    const pending = getPendingActivity()
    const pendingId = pending?.id || ''
    const pname = pending?.name || '饭局'
    if (!pendingId) return
    const cartData = store.get('cart') || {}
    const entries = Object.entries(cartData).filter(([, qty]) => Number(qty) > 0)
    if (!entries.length) {
      showToast({ title: '先选几道菜再确认加入', icon: 'none' })
      return
    }
    if (joining) return
    setJoining(true)
    try {
      for (const [dishId, qty] of entries) {
        await activities.addItem(pendingId, dishId, Number(qty))
      }
      store.set('cart', {})
      setCart({})
      setCartCount(0)
      clearPendingActivity()
      showToast({ title: '已加入「' + pname + '」', icon: 'success' })
      setTimeout(() => {
        Taro.redirectTo({ url: '/pages/activity-detail/index?id=' + pendingId })
      }, 600)
    } catch (e: any) {
      showToast({ title: e?.message || '加入饭局失败', icon: 'none' })
    } finally {
      setJoining(false)
    }
  }

  /** 创建新饭局 */
  const confirmJoin = async () => {
    if (!createTeamId) { showToast({ title: '请选择团队', icon: 'none' }); return }
    if (!createType) { showToast({ title: '请选择饭局类型', icon: 'none' }); return }
    if (joining) return
    const cartData = store.get('cart') || {}
    const entries = Object.entries(cartData).filter(([, qty]) => Number(qty) > 0)
    setJoining(true)
    try {
      let activityId: string | number = ''
      try {
        const listRes: any = await activities.list({ team_id: createTeamId, status: 'ordering' })
        const first = (listRes?.items?.[0]) ?? null
        if (first?.id && first?.type === createType) activityId = first.id
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
        setCurrentTeamId(String(createTeamId))
      }
      for (const [dishId, qty] of entries) {
        await activities.addItem(activityId, dishId, Number(qty))
      }
      store.set('cart', {})
      setCart({})
      setCartCount(0)
      setCreateVisible(false)
      clearPendingActivity()
      showToast({ title: isReuse ? '已加入饭局' : '饭局已创建', icon: 'success' })
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/activity-detail/index?id=' + activityId })
      }, 600)
    } catch (e: any) {
      showToast({ title: e?.message || '创建饭局失败', icon: 'none' })
    } finally {
      setJoining(false)
    }
  }

  const dishesTitle = keyword
    ? '搜索「' + keyword + '」（' + dishes.length + '）'
    : ((categories.find((c: any) => String(c.id) === String(activeCategoryId)))?.name || '全部菜品') + '（' + dishes.length + '）'

  return (
    <View className="ggc-page ggc-tabbar-page" style={{ position: 'relative' }}>
      {/* 顶部用户区 */}
      <View style={{ background: 'linear-gradient(135deg,#4CAF50,#388E3C)', padding: '18px 16px 24px', color: '#fff', flexShrink: 0 }}>
        <View style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <View style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1px solid rgba(255,255,255,.3)' }}>
            {user.avatar || '👤'}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ fontWeight: 600, fontSize: '16px' }}>{user.nickname || '好好吃饭'}</View>
            <View style={{ fontSize: '12px', opacity: .9 }}>只为好好吃饭</View>
          </View>
        </View>
      </View>

      {/* 为已有饭局加菜横幅 */}
      {pendingName ? (
        <View style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#FFF8E1', borderBottom: '1px solid #FFE082' }}>
          <Text style={{ fontSize: '13px', color: '#FF9800', fontWeight: 600 }}>🍳 正在为「{pendingName}」加菜</Text>
          <Text style={{ flex: 1 }} />
          <Text onClick={() => {
            clearPendingActivity()
            setPendingName('')
          }} style={{ fontSize: '12px', color: '#F44336', cursor: 'pointer' }}>取消</Text>
        </View>
      ) : null}

      {/* 搜索栏 */}
      <View style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: 'var(--color-bg-card)', flexShrink: 0 }}>
        <View style={{
          flex: 1, display: 'flex', alignItems: 'center',
          height: '40px', padding: '0 14px', borderRadius: '10px',
           border: '1px solid #ECECEC',
        }}>
          <Text style={{ fontSize: '14px', color: '#BDBDBD', marginRight: '6px', flexShrink: 0 }}>🔍</Text>
          <Input
            style={{ flex: 1, height: '40px', lineHeight: '40px', fontSize: '14px', color: 'var(--color-text-primary)' }}
            placeholder="搜索菜品或食材"
            value={keyword}
            onChange={(v: string) => onSearch(v)}
          />
          {!!keyword && (
            <Text onClick={clearSearch} style={{ fontSize: '16px', color: '#BDBDBD', padding: '0 2px', cursor: 'pointer', flexShrink: 0 }}>✕</Text>
          )}
        </View>
      </View>

      <View style={{ display: 'flex', gap: '10px', padding: '10px 16px', background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-divider)', flexShrink: 0 }}>
        <View onClick={() => { setRecommendVisible(true); setPeopleText('3'); setRecommend(null) }}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', borderRadius: '8px', background: '#FFF3E0', color: '#FF9800', fontWeight: 500, fontSize: '14px' }}>
          <Text>🤔</Text><Text>今天吃什么</Text>
        </View>
        <View onClick={onSurprise}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', borderRadius: '8px', background: '#E3F2FD', color: '#1565C0', fontWeight: 500, fontSize: '14px' }}>
          <Text>✨</Text><Text>{randomLoading ? '推荐中…' : '惊喜推荐'}</Text>
        </View>
      </View>

      <View style={{ height: '70vh', display: 'flex', overflow: 'hidden', paddingBottom: '90px' }}>
        <ScrollView scrollY style={{ width: '88px', height: '100%', background: 'var(--color-bg-page)', flexShrink: 0, opacity: keyword ? 0.45 : 1, transition: 'opacity 0.2s', paddingBottom: '90px' }}>
          {categories.map((c: any) => {
            const active = !keyword && String(c.id) === String(activeCategoryId)
            return (
              <View key={c.id} onClick={() => onCategoryTap(c.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                  padding: '12px 4px', position: 'relative', minHeight: '64px', justifyContent: 'center',
                  background: active ? '#fff' : 'transparent'
                }}>
                {active && <View style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: '3px', height: '24px', background: GREENS.primary, borderRadius: '0 2px 2px 0' }} />}
                <Text style={{ fontSize: '20px' }}>{c.icon}</Text>
                <Text style={{ fontSize: '11px', textAlign: 'center', color: active ? GREENS.primary : '#666', fontWeight: active ? 600 : 400 }}>{c.name}</Text>
                <Text style={{ fontSize: '9px', color: 'var(--color-text-placeholder)' }}>{c.count}</Text>
              </View>
            )
          })}
        </ScrollView>

        <ScrollView scrollY style={{ flex: 1, minWidth: 0, height: '100%', padding: '12px 12px 200px', background: 'var(--color-bg-card)' }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingLeft: '4px' }}>
            <Text style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{dishesTitle}</Text>
            {!!keyword && (
              <Text onClick={clearSearch} style={{ fontSize: '12px', color: GREENS.primary, cursor: 'pointer' }}>清除搜索</Text>
            )}
          </View>
          {loading && <View style={{ color: 'var(--color-text-placeholder)', fontSize: '14px', textAlign: 'center', padding: '24px' }}>加载中…</View>}
          {!loading && dishes.length === 0 && (
            <Empty description="没有找到相关菜品" image={<Text style={{ fontSize: '48px' }}>🍽</Text>} />
          )}
          {dishes.map((d: any) => {
            const qty = cart[d.id] || 0
            const fav = !!favoritedMap[d.id]
            return (
              <View key={d.id} onClick={() => onDishTap(d)}
                style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
                {dishThumb(d, 56, 28)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Text style={{ fontWeight: 600, fontSize: '15px' }}>{d.name}</Text>
                    <View onClick={(e: any) => { e.stopPropagation(); onFavorite(d) }}
                      style={{ fontSize: '16px', cursor: 'pointer' }}>
                      <Text>{fav ? '❤️' : '🤍'}</Text>
                    </View>
                  </View>
                  <View style={{
                      color: 'var(--color-text-placeholder)', fontSize: '11px', marginTop: '2px',
                      display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '16px',
                    }}>{d.description}</View>
                  <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <Text style={{ color: '#FF9800', fontSize: '12px' }}>★ {d.rating || '-'}
                      {d.rating_count ? <Text style={{ color: 'var(--color-text-placeholder)', fontSize: '10px' }}>（{d.rating_count}人评）</Text> : null}
                    </Text>
                    <Text style={{ color: greyd }}>·</Text>
                    <Text style={{ color: GREENS.primaryDark, fontSize: '12px' }}>{d.category_name || ''}</Text>
                  </View>
                  {/* 价格暂不展示（HowToCook 导入菜无定价）
                  <View style={{ color: '#F44336', fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>¥{d.price}</View>
                  */}
                </View>
                <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {qty > 0 && (
                    <>
                      <View onClick={(e: any) => { e.stopPropagation(); minusCart(d.id) }} style={qtyBtn}>−</View>
                      <Text style={{ width: '18px', textAlign: 'center', fontSize: '14px' }}>{qty}</Text>
                    </>
                  )}
                  <View onClick={(e: any) => { e.stopPropagation(); addCart(d.id) }} style={{ ...qtyBtn, background: GREENS.primary, color: '#fff' }}>+</View>
                </View>
              </View>
            )
          })}
        </ScrollView>
      </View>

      {/* 底部操作栏 */}
      <View className="ggc-bottom-bar" style={{ display: 'flex', gap: '8px', padding: '10px 16px', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-divider)', flexShrink: 0 }}>
        <View onClick={() => requireLogin('发新菜谱需要登录') && Taro.navigateTo({ url: '/pages/dish-edit/index' })} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 10px', color: '#4CAF50', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Text style={{ fontSize: 16 }}>＋</Text><Text>新菜品</Text>
        </View>
        {isPendingMode() ? (
          <Button type="primary" size="small" style={{ flex: 1, fontSize: '14px' }} loading={joining} onClick={onSubmit}>
            确认加入「{pendingName || '饭局'}」（{cartCount}）
          </Button>
        ) : cartCount > 0 ? (
          <Button type="primary" size="small" style={{ flex: 1, fontSize: '14px' }} onClick={() => Taro.navigateTo({ url: '/pages/cart/index' })}>
            购物车（{cartCount}）
          </Button>
        ) : (
          <Button type="primary" size="small" style={{ flex: 1, fontSize: '14px' }} loading={joining} onClick={onSubmit}>
            创建饭局
          </Button>
        )}
      </View>

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
          <Button type="primary" block loading={joining} onClick={confirmJoin}>创建饭局</Button>
          <View style={{ fontSize: 11, color: 'var(--color-text-placeholder)', textAlign: 'center', marginTop: 8 }}>团队与类型均为必选</View>
        </View>
      </Popup>

      {/* 今天吃什么 推荐弹层 */}
      <Popup
        visible={recommendVisible}
        position="bottom"
        round
        onClose={() => setRecommendVisible(false)}
        title="今天吃什么"
        style={{ maxHeight: '80vh', overflow: 'auto' }}
      >
        <View style={{ padding: '16px 24px 24px' }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
            <Text>几个人吃？</Text>
            <View style={{
              width: '70px', height: '36px',
              border: '1px solid var(--color-border)', borderRadius: '8px',
              overflow: 'hidden', flexShrink: 0,
            }}>
              <Input
                type="number"
                value={peopleText}
                style={{ width: '100%', height: '36px', textAlign: 'center', fontSize: '15px' }}
                onChange={(v: string) => setPeopleText(v)}
                disabled={recommendLoading}
              />
            </View>
            <Button type="primary" size="small" style={{ flex: 1 }} loading={recommendLoading} onClick={onRecommendLoad}>给我推荐</Button>
          </View>

          {recommendLoading && <View style={{ color: 'var(--color-text-placeholder)', fontSize: '14px', textAlign: 'center', padding: '20px' }}>推荐中…</View>}

          {!recommendLoading && recommend && (
            <>
              <View style={{ fontSize: '13px', color: '#FF9800', fontWeight: 600, marginBottom: '10px', padding: '12px', background: '#FFF8E1', borderRadius: '6px' }}>
                {recommend.reason || '今日推荐'}
              </View>
              <View>
                {(recommend.plan || []).map((item: any) => (
                  <View key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px' }}>
                    {dishThumb(item, 36, 20)}
                    <View style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: '14px', fontWeight: 500 }}>{item.name}</Text>
                      {/* 价格暂不展示
                    <Text style={{ fontSize: '13px', color: '#F44336', fontWeight: 600 }}>¥{item.price}</Text>
                    */}
                    </View>
                  </View>
                ))}
              </View>
              <View style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <Button fill="outline" size="small" style={{ flex: 1, fontSize: '13px' }} onClick={onRecommendSavePlan}>存为计划</Button>
                <Button type="primary" size="small" style={{ flex: 1, fontSize: '13px' }} onClick={onRecommendAddAll}>一键加入购物车</Button>
              </View>
            </>
          )}
        </View>
      </Popup>
    </View>
  )
}

const greyd = 'var(--color-text-placeholder)'
const qtyBtn = { width: '26px', height: '26px', borderRadius: '50%', background: 'var(--color-bg-page)', color: 'var(--color-text-primary)', display: 'flex' as const, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '15px' }

/** 菜品缩略图：有图用图，无图回落 emoji 色块（导入菜自动带图，自建菜走 emoji） */
const dishThumb = (d: any, size: number, fontSize: number) =>
  d.image_url ? (
    <Image
      src={mediaUrl(d.image_url) ?? d.image_url}
      mode="aspectFill"
      style={{ width: `${size}px`, height: `${size}px`, borderRadius: '10px', flexShrink: 0, background: '#f5f5f5' }}
    />
  ) : (
    <View style={{ width: `${size}px`, height: `${size}px`, borderRadius: '10px', background: d.color || '#E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fontSize}px`, flexShrink: 0 }}>
      {d.emoji || '🍽'}
    </View>
  )
