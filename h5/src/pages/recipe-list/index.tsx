import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useLoad, useReachBottom } from '@tarojs/taro'
import { useState } from 'react'
import { Button, Empty, Skeleton, Tag } from '@nutui/nutui-react-taro'
import { recipes } from '../../api'

//
// 我的菜谱列表页——对齐原生 miniprogram/pages/recipe-list
//

const PAGE_SIZE = 10

export default function RecipeListPage() {
  const [list, setList] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = (reset: boolean) => {
    const p = reset ? 1 : page
    if (!reset) {
      if (loadingMore || !hasMore) return
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    recipes.list({ owner: 'me', page: p, page_size: PAGE_SIZE })
      .then((res: any) => {
        const items = res.items || []
        setList(reset ? items : (prev: any[]) => prev.concat(items))
        setTotal(res.total || 0)
        setPage(p + 1)
        setHasMore(items.length >= PAGE_SIZE)
      })
      .catch(() => Taro.showToast({ title: '菜谱加载失败', icon: 'none' }))
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }

  useLoad(() => load(true))
  useDidShow(() => { if (total > 0 || list.length > 0) load(true) })
  useReachBottom(() => load(false))

  const goDetail = (id: any) => Taro.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` })
  const goCreate = () => Taro.navigateTo({ url: '/pages/recipe-edit/index' })

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '80px' }}>
      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
        <Text style={{ fontSize: '17px', fontWeight: 'bold' }}>我的菜谱</Text>
        {total > 0 && <Text style={{ fontSize: '13px', color: '#999' }}>共 {total} 份</Text>}
      </View>

      {loading ? (
        <View style={{ padding: '16px' }}><Skeleton rows={4} animated /></View>
      ) : list.length > 0 ? (
        <View style={{ padding: '0 12px' }}>
          {list.map((r) => (
            <View key={r.id} onClick={() => goDetail(r.id)} style={{
              display: 'flex', background: '#fff', borderRadius: '12px', padding: '12px', marginBottom: '10px', cursor: 'pointer'
            }}>
              <View style={{
                width: '56px', height: '56px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px',
                background: r.color || '#E8F5E9'
              }}>{r.emoji || '🍽'}</View>
              <View style={{ flex: 1, marginLeft: '12px' }}>
                <Text style={{ fontSize: '16px', fontWeight: '600' }}>{r.name}</Text>
                <Text style={{ display: 'block', fontSize: '12px', color: '#999', marginTop: '3px' }}>{r.description || '暂无描述'}</Text>
                <View style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                  <Text style={{ fontSize: '12px', color: '#888' }}>⏱ {r.cook_time ? `${r.cook_time} 分钟` : '—'}</Text>
                  {r.difficulty && <Text style={{ fontSize: '12px', color: '#888' }}>难度 {r.difficulty}</Text>}
                  {r.is_public && <Tag type="success" plain>公开</Tag>}
                </View>
              </View>
              <Text style={{ color: '#ccc', alignSelf: 'center' }}>›</Text>
            </View>
          ))}
          {loadingMore && <View style={{ textAlign: 'center', color: '#999', padding: '12px', fontSize: '13px' }}>加载中…</View>}
        </View>
      ) : (
        <View style={{ paddingTop: '15vh', textAlign: 'center' }}>
          <Empty description="还没有菜谱，记录你的第一道拿手菜吧" imageSize={120} />
          <Button block type="primary" style={{ margin: '20px auto 0', width: '180px' }} onClick={goCreate}>新建菜谱</Button>
        </View>
      )}

      {/* 悬浮新建 */}
      <View onClick={goCreate} style={{
        position: 'fixed', right: '20px', bottom: '40px', width: '52px', height: '52px', borderRadius: '50%',
        background: '#4CAF50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px', boxShadow: '0 4px 12px rgba(76,175,80,0.4)', cursor: 'pointer', zIndex: 10
      }}>＋</View>
    </View>
  )
}
