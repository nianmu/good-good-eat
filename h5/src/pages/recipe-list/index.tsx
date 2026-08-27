import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useLoad, useReachBottom } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Empty, Skeleton } from '@nutui/nutui-react-taro'
import { recipes, categories as catApi } from '../../api'

//
// 菜谱库列表页——公开菜谱（最终版）+ 我的菜谱 + 分类筛选
//

const PAGE_SIZE = 10
type Owner = 'public' | 'me'

export default function RecipeListPage() {
  const [owner, setOwner] = useState<Owner>('public')
  const [cats, setCats] = useState<any[]>([])
  const [catId, setCatId] = useState<string>('')
  const [list, setList] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = (reset: boolean, ownerValue?: Owner, catValue?: string) => {
    const o = ownerValue ?? owner
    const c = catValue ?? catId
    const p = reset ? 1 : page
    if (!reset) {
      if (loadingMore || !hasMore) return
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    const params: any = { owner: o, page: p, page_size: PAGE_SIZE }
    if (c) params.category_id = c
    recipes.list(params)
      .then((res: any) => {
        const items = res.items || []
        setList(prev => (reset ? items : prev.concat(items)))
        setTotal(res.total || 0)
        setPage(p + 1)
        setHasMore(items.length >= PAGE_SIZE)
      })
      .catch(() => showToast({ title: '菜谱加载失败', icon: 'none' }))
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }

  useLoad(() => {
    catApi.list().then((cs: any) => {
      setCats(cs || [])
      return cs || []
    }).catch(() => setCats([]))
    load(true)
  })
  useDidShow(() => load(true))
  useReachBottom(() => load(false))

  const switchOwner = (o: Owner) => {
    if (o === owner) return
    setOwner(o)
    setList([])
    setPage(1)
    setLoading(true)
    setLoadingMore(false)
    load(true, o)
  }

  const switchCat = (id: string) => {
    setCatId(id)
    setList([])
    setPage(1)
    setLoading(true)
    setLoadingMore(false)
    load(true, owner, id)
  }

  const goDetail = (id: any) => Taro.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` })
  const goCreate = () => Taro.navigateTo({ url: '/pages/recipe-edit/index' })

  const title = owner === 'public' ? '公开菜谱' : '我的菜谱'

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '80px' }}>
      {/* 顶部：Tab 切换 */}
      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 8px' }}>
        <Text style={{ fontSize: '17px', fontWeight: 'bold' }}>{title}</Text>
        {total > 0 && <Text style={{ fontSize: '13px', color: 'var(--color-text-placeholder)' }}>共 {total} 份</Text>}
      </View>
      <View style={{ display: 'flex', gap: '10px', padding: '0 16px 8px' }}>
        <View onClick={() => switchOwner('public')} style={{
          padding: '6px 16px', borderRadius: '16px', fontSize: '13px', cursor: 'pointer',
          background: owner === 'public' ? '#4CAF50' : '#f0f0f0', color: owner === 'public' ? '#fff' : '#555'
        }}>公开菜谱</View>
        <View onClick={() => switchOwner('me')} style={{
          padding: '6px 16px', borderRadius: '16px', fontSize: '13px', cursor: 'pointer',
          background: owner === 'me' ? '#4CAF50' : '#f0f0f0', color: owner === 'me' ? '#fff' : '#555'
        }}>我的菜谱</View>
      </View>

      {/* 分类筛选 */}
      {cats.length > 0 && (
        <ScrollView scrollX showScrollbar={false} style={{ whiteSpace: 'nowrap', padding: '2px 16px 10px' }}>
          <View style={{ display: 'inline-flex', gap: 8 }}>
            <View onClick={() => switchCat('')} style={{
              padding: '5px 14px', borderRadius: 16, fontSize: 12,
              background: !catId ? '#4CAF50' : '#f0f0f0', color: !catId ? '#fff' : '#555', cursor: 'pointer'
            }}>全部</View>
            {cats.map((c: any) => (
              <View key={c.id} onClick={() => switchCat(String(c.id))} style={{
                padding: '5px 14px', borderRadius: 16, fontSize: 12,
                background: String(catId) === String(c.id) ? '#4CAF50' : '#f0f0f0',
                color: String(catId) === String(c.id) ? '#fff' : '#555', cursor: 'pointer'
              }}>{c.icon} {c.name}</View>
            ))}
          </View>
        </ScrollView>
      )}

      {loading ? (
        <View style={{ padding: '16px' }}><Skeleton rows={4} animated /></View>
      ) : list.length > 0 ? (
        <View style={{ padding: '0 12px' }}>
          {list.map((r) => (
            <View key={r.id} onClick={() => goDetail(r.id)} style={{
              display: 'flex', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '12px', marginBottom: '10px', cursor: 'pointer'
            }}>
              <View style={{
                width: '56px', height: '56px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px',
                background: r.color || '#E8F5E9'
              }}>{r.emoji || '🍽'}</View>
              <View style={{ flex: 1, marginLeft: '12px' }}>
                <Text style={{ fontSize: '16px', fontWeight: '600' }}>{r.name}</Text>
                <Text style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-placeholder)', marginTop: '3px' }}>{r.description || '暂无描述'}</Text>
                <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                  <Text style={{ fontSize: '12px', color: 'var(--color-text-placeholder)' }}>⏱ {r.cook_time ? `${r.cook_time} 分钟` : '—'}</Text>
                  {r.difficulty && <Text style={{ fontSize: '12px', color: 'var(--color-text-placeholder)' }}>难度 {r.difficulty}</Text>}
                  {owner === 'public' && r.author && <Text style={{ fontSize: '12px', color: 'var(--color-text-placeholder)' }}>· {r.author}</Text>}
                </View>
              </View>
              <Text style={{ color: '#ccc', alignSelf: 'center' }}>›</Text>
            </View>
          ))}
          {loadingMore && <View style={{ textAlign: 'center', color: 'var(--color-text-placeholder)', padding: '12px', fontSize: '13px' }}>加载中…</View>}
        </View>
      ) : (
        <View style={{ paddingTop: '15vh', textAlign: 'center' }}>
          <Empty description={owner === 'public' ? '还没有公开菜谱' : '还没有菜谱，记录你的第一道拿手菜吧'} imageSize={120} />
          {owner === 'me' && <Button block type="primary" style={{ margin: '20px auto 0', width: '180px' }} onClick={goCreate}>新建菜谱</Button>}
        </View>
      )}

      {/* 悬浮新建（我的菜谱可见） */}
      {owner === 'me' && (
        <View onClick={goCreate} style={{
          position: 'fixed', right: '20px', bottom: '40px', width: '52px', height: '52px', borderRadius: '50%',
          background: '#4CAF50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', boxShadow: '0 4px 12px rgba(76,175,80,0.4)', cursor: 'pointer', zIndex: 10
        }}>＋</View>
      )}
    </View>
  )
}
