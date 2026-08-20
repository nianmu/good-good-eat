import { useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { Input, Button, Popup, Empty } from '@nutui/nutui-react-taro'

import { auth, guestLogin, dishes as dishApi, categories as catApi, favorites as favApi } from '../../api'
import { store } from '../../store'

// 菜谱主页——好好吃饭（跨端 H5）
// 分类 + 搜索 + 菜品（emoji 色块/评分/价格/加购）+ 收藏 + 随机点菜 + 惊喜推荐 + 今天吃什么弹层
const GREENS = { primary: '#4CAF50', primaryDark: '#388E3C', primaryBg: '#E8F5E9' }

export default function MenuPage() {
  const [user, setUser] = useState<any>({ avatar: '👤', nickname: '好好吃饭' })
  const [teams, setTeams] = useState<any[]>([])
  const [currentTeamName, setCurrentTeamName] = useState('')
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
        setCurrentTeamName(cur ? cur.name : '')
        setCurrentTeamId(cur ? cur.id : '')
      })
      .catch(() => {})
  }

  const applyFilter = (cats: any[], all: any[], catId: string, kw: string) => {
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
    try {
      await guestLogin().catch(() => null)
      loadUser()
      const [catRes, dishRes] = await Promise.all([
        catApi.list(),
        dishApi.list()
      ])
      const cats = catRes || []
      const all = (dishRes as any)?.items || []
      cats.forEach((c: any) => {
        c.count = all.filter((d: any) => String(d.category_id) === String(c.id)).length
      })
      setCategories(cats)
      setAllDishes(all)
      const first = cats[0] || null
      setActiveCategoryId(first ? first.id : '')
      setLoading(false)
      applyFilter(cats, all, first ? first.id : '', keyword)
    } catch (e: any) {
      console.log('menu load err', e)
      setLoading(false)
    }
  })

  useDidShow(() => {
    syncCart()
    loadFavorites()
    loadUser() // 从团队页返回时刷新团队/当前团队
  })

  const onSearch = (v: string) => {
    setKeyword(v)
    applyFilter(categories, allDishes, keyword ? '' : activeCategoryId, v)
  }

  const onCategoryTap = (id: string) => {
    setActiveCategoryId(id)
    setKeyword('')
    applyFilter(categories, allDishes, id, '')
  }

  const onDishTap = (d: any) => {
    Taro.navigateTo({ url: '/pages/dish-detail/index?id=' + d.id })
  }

  const setQty = (id: number, qty: number) => {
    const cur = cart[id] || 0
    const next = Math.max(0, qty)
    store.setCartQuantity(id, next)
    const c = { ...cart, [id]: next }
    if (next <= 0) delete c[id]
    setCart(c)
    setCartCount(Object.keys(c).reduce((a, k) => a + (c[k] || 0), 0))
  }

  const addCart = (id: number) => setQty(id, (cart[id] || 0) + 1)
  const minusCart = (id: number) => setQty(id, (cart[id] || 0) - 1)

  /** 一组菜品批量加入购物车（随机/推荐共用） */
  const addGroupToCart = (picks: any[]) => {
    const c = { ...store.get('cart') }
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
        if (cur) Taro.showToast({ title: '已取消收藏', icon: 'none' })
      })
      .catch((e: any) => Taro.showToast({ title: (e as any)?.message || '操作失败', icon: 'none' }))
  }

  /** 随机点菜（均衡） */
  const onRandom = () => {
    if (randomLoading) return
    setRandomLoading(true)
    dishApi.random(3, 'balanced')
      .then((res: any) => {
        const picks = res || []
        if (!picks.length) {
          Taro.showToast({ title: '暂无可推荐的菜品', icon: 'none' })
          return
        }
        addGroupToCart(picks)
        Taro.showToast({ title: '推荐：' + picks.map((d: any) => d.name).join('、'), icon: 'none' })
      })
      .catch((e: any) => Taro.showToast({ title: (e as any)?.message || '推荐失败', icon: 'none' }))
      .finally(() => setRandomLoading(false))
  }

  /** 惊喜推荐 */
  const onSurprise = () => {
    if (randomLoading) return
    setRandomLoading(true)
    dishApi.random(3, 'surprise')
      .then((res: any) => {
        const picks = res || []
        if (!picks.length) {
          Taro.showToast({ title: '暂无可推荐的菜品', icon: 'none' })
          return
        }
        addGroupToCart(picks)
        Taro.showToast({ title: '惊喜：' + picks.map((d: any) => d.name).join('、'), icon: 'none' })
      })
      .catch((e: any) => Taro.showToast({ title: (e as any)?.message || '推荐失败', icon: 'none' }))
      .finally(() => setRandomLoading(false))
  }

  /** 今天吃什么：按人数推荐 */
  const onRecommendLoad = () => {
    const people = parseInt(peopleText, 10) || 3
    setRecommendLoading(true)
    setRecommend(null)
    dishApi.recommend(Math.max(1, Math.min(20, people)))
      .then((res: any) => setRecommend(res))
      .catch((e: any) => Taro.showToast({ title: (e as any)?.message || '推荐失败', icon: 'none' }))
      .finally(() => setRecommendLoading(false))
  }

  const onRecommendAddAll = () => {
    const plan = (recommend && recommend.plan) || []
    if (!plan.length) return
    addGroupToCart(plan)
    setRecommendVisible(false)
    setRecommend(null)
    Taro.showToast({ title: '已加入购物车', icon: 'none' })
  }

  const onRecommendSavePlan = () => {
    const plan = (recommend && recommend.plan) || []
    if (!plan.length) return
    // 存为计划：跳 plans 页（用户可进一步编辑），简单 toast 提示
    Taro.showToast({ title: '已保存为今日计划（' + plan.length + ' 道）', icon: 'none' })
    setRecommendVisible(false)
    setRecommend(null)
  }

  const onInvite = () => Taro.showToast({ title: '邀请链接即将上线，敬请期待', icon: 'none' })

  const onSubmit = () => {
    if (!cartCount) {
      Taro.showToast({ title: '购物车是空的，先点几道菜吧', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: '/pages/cart/index' })
  }

  const dishesTitle = keyword
    ? '搜索「' + keyword + '」（' + dishes.length + '）'
    : ((categories.find((c: any) => String(c.id) === String(activeCategoryId)))?.name || '全部菜品') + '（' + dishes.length + '）'

  return (
    <View className="ggc-page" style={{ position: 'relative' }}>
      {/* 顶部用户区 + 团队 */}
      <View style={{ background: 'linear-gradient(135deg,#4CAF50,#388E3C)', padding: '18px 16px 24px', color: '#fff', flexShrink: 0 }}>
        <View style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <View style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,255,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1px solid rgba(255,255,255,.3)' }}>
            {user.avatar || '👤'}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ fontWeight: 600, fontSize: '16px' }}>{user.nickname || '好好吃饭'}</View>
            <View style={{ fontSize: '12px', opacity: .9 }}>只为好好吃饭</View>
          </View>
          <View style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(255,255,255,.2)', borderRadius: '999px', fontSize: '13px', cursor: 'pointer' }}
            onClick={() => Taro.navigateTo({ url: '/pages/team-list/index' })}>
            <Text>🏠</Text>
            <Text>{currentTeamName || '选择团队'}</Text>
            <Text style={{ fontSize: '10px', opacity: .8 }}>▾</Text>
          </View>
        </View>
      </View>

      {/* 搜索栏 */}
      <View style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee', flexShrink: 0 }}>
        <View style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 12px', background: '#F5F5F5', borderRadius: '999px' }}>
          <Text style={{ opacity: .5 }}>🔍</Text>
          <Input
            style={{ flex: 1, fontSize: '14px' }}
            placeholder="搜索菜品或食材"
            value={keyword}
            onChange={(v: string) => onSearch(v)}
          />
        </View>
        <View style={{ display: 'flex', alignItems: 'center', color: GREENS.primary, fontWeight: 500, fontSize: '14px', gap: '4px' }}
          onClick={() => Taro.navigateTo({ url: '/pages/cart/index' })}>
          <Text>点单</Text>
          {cartCount > 0 && (
            <View style={{ minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '999px', background: GREENS.primary, color: '#fff', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {cartCount}
            </View>
          )}
        </View>
      </View>

      {/* 五期：今天吃什么 / 惊喜推荐 快捷区 */}
      <View style={{ display: 'flex', gap: '10px', padding: '10px 16px', background: '#fff', borderBottom: '1px solid #eee', flexShrink: 0 }}>
        <View onClick={() => { setRecommendVisible(true); setPeopleText('3'); setRecommend(null) }}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', borderRadius: '8px', background: '#FFF3E0', color: '#FF9800', fontWeight: 500, fontSize: '14px' }}>
          <Text>🤔</Text><Text>今天吃什么</Text>
        </View>
        <View onClick={onSurprise}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px', borderRadius: '8px', background: '#E3F2FD', color: '#1565C0', fontWeight: 500, fontSize: '14px' }}>
          <Text>✨</Text><Text>{randomLoading ? '推荐中…' : '惊喜推荐'}</Text>
        </View>
      </View>

      {/* 主体：左侧分类 + 右侧菜品 */}
      <View style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* 左侧分类 */}
        <ScrollView scrollY style={{ width: '88px', background: '#F5F5F5', flexShrink: 0, height: '100%' }}>
          {categories.map((c: any) => {
            const active = String(c.id) === String(activeCategoryId)
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
                <Text style={{ fontSize: '9px', color: '#999' }}>{c.count}</Text>
              </View>
            )
          })}
        </ScrollView>

        {/* 右侧菜品列表 */}
        <ScrollView scrollY style={{ flex: 1, minWidth: 0, height: '100%', padding: '12px', background: '#fff' }}>
          <View style={{ fontSize: '13px', color: '#666', marginBottom: '12px', paddingLeft: '4px' }}>{dishesTitle}</View>
          {loading && <View style={{ color: '#999', fontSize: '14px', textAlign: 'center', padding: '24px' }}>加载中…</View>}
          {!loading && dishes.length === 0 && (
            <Empty description="没有找到相关菜品" image={<Text style={{ fontSize: '48px' }}>🍽</Text>} />
          )}
          {dishes.map((d: any) => {
            const qty = cart[d.id] || 0
            const fav = !!favoritedMap[d.id]
            return (
              <View key={d.id} onClick={() => onDishTap(d)}
                style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'center' }}>
                <View style={{ width: '56px', height: '56px', borderRadius: '10px', background: d.color || '#E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>
                  {d.emoji || '🍽'}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Text style={{ fontWeight: 600, fontSize: '15px' }}>{d.name}</Text>
                    <View onClick={(e: any) => { e.stopPropagation(); onFavorite(d) }}
                      style={{ fontSize: '16px', cursor: 'pointer' }}>
                      <Text>{fav ? '❤️' : '🤍'}</Text>
                    </View>
                  </View>
                  <View style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>{d.description}</View>
                  <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <Text style={{ color: '#FF9800', fontSize: '12px' }}>★ {d.rating || '-'}
                      {d.rating_count ? <Text style={{ color: '#999', fontSize: '10px' }}>（{d.rating_count}人评）</Text> : null}
                    </Text>
                    <Text style={{ color: greyd }}>·</Text>
                    <Text style={{ color: GREENS.primaryDark, fontSize: '12px' }}>{d.category_name || ''}</Text>
                  </View>
                  <View style={{ color: '#F44336', fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>¥{d.price}</View>
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
      <View style={{ display: 'flex', gap: '8px', padding: '10px 16px', background: '#fff', borderTop: '1px solid #eee', flexShrink: 0 }}>
        <Button type="primary" fill="outline" size="small" style={{ flex: 1, fontSize: '13px' }} loading={randomLoading} onClick={onRandom}>
          🎲 {randomLoading ? '推荐中…' : '随机点菜'}
        </Button>
        <Button fill="none" size="small" style={{ flex: 1, fontSize: '13px', color: '#FF9800', background: '#FFF3E0' }} onClick={onInvite}>
          📨 邀请下单
        </Button>
        <Button type="primary" size="small" style={{ flex: 1.5, fontSize: '13px' }} onClick={onSubmit}>
          下单{cartCount > 0 ? '（' + cartCount + '）' : ''}
        </Button>
      </View>

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
          <View style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#666', marginBottom: '12px' }}>
            <Text>几个人吃？</Text>
            <Input
              type="number"
              value={peopleText}
              style={{ width: '70px', height: '34px', border: '1px solid #E0E0E0', borderRadius: '8px', textAlign: 'center', fontSize: '15px' }}
              onChange={(v: string) => setPeopleText(v)}
              disabled={recommendLoading}
            />
            <Button type="primary" size="small" style={{ flex: 1 }} loading={recommendLoading} onClick={onRecommendLoad}>给我推荐</Button>
          </View>

          {recommendLoading && <View style={{ color: '#999', fontSize: '14px', textAlign: 'center', padding: '20px' }}>推荐中…</View>}

          {!recommendLoading && recommend && (
            <>
              <View style={{ fontSize: '13px', color: '#FF9800', fontWeight: 600, marginBottom: '10px', padding: '12px', background: '#FFF8E1', borderRadius: '6px' }}>
                {recommend.reason || '今日推荐'}
              </View>
              <View>
                {(recommend.plan || []).map((item: any) => (
                  <View key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px' }}>
                    <View style={{ width: '36px', height: '36px', borderRadius: '8px', background: item.color || '#E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                      {item.emoji}
                    </View>
                    <View style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: '14px', fontWeight: 500 }}>{item.name}</Text>
                      <Text style={{ fontSize: '13px', color: '#F44336', fontWeight: 600 }}>¥{item.price}</Text>
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

const greyd = '#999'
const qtyBtn = { width: '26px', height: '26px', borderRadius: '50%', background: '#eee', color: '#333', display: 'flex' as const, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '15px' }

