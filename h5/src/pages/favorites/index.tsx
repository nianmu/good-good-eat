import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useLoad, useReachBottom } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Empty, Skeleton } from '@nutui/nutui-react-taro'
import { favorites } from '../../api'

//
// 我的收藏页——对齐原生 miniprogram/pages/favorites
//

const PAGE_SIZE = 10

export default function FavoritesPage() {
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
    favorites.list().then((res: any) => {
      const items = res.items || []
      setList(reset ? items : (prev: any[]) => prev.concat(items))
      setTotal(res.total || 0)
      setPage(p + 1)
      setHasMore(items.length >= PAGE_SIZE)
    }).catch(() => showToast({ title: '收藏加载失败', icon: 'none' }))
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }

  useLoad(() => load(true))
  useDidShow(() => { if (list.length > 0) load(true) })
  useReachBottom(() => load(false))

  const goDish = (id: any) => Taro.navigateTo({ url: `/pages/dish-detail/index?id=${id}` })
  const goMenu = () => Taro.switchTab({ url: '/pages/menu/index' })

  const onUnfavorite = (id: any) => {
    favorites.remove(id).then(() => load(true)).catch(() => showToast({ title: '操作失败', icon: 'none' }))
  }

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '20px' }}>
      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
        <Text style={{ fontSize: '17px', fontWeight: 'bold' }}>我的收藏</Text>
        {total > 0 && <Text style={{ fontSize: '13px', color: '#999' }}>共 {total} 道</Text>}
      </View>

      {loading ? (
        <View style={{ padding: '16px' }}><Skeleton rows={4} animated /></View>
      ) : list.length > 0 ? (
        <View style={{ padding: '0 12px' }}>
          {list.map((d) => (
            <View key={d.id} style={{ background: '#fff', borderRadius: '12px', padding: '12px', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
              <View onClick={() => goDish(d.id)} style={{ display: 'flex', flex: 1, alignItems: 'center', cursor: 'pointer' }}>
                <View style={{ width: '52px', height: '52px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', background: d.color || '#E8F5E9' }}>{d.emoji}</View>
                <View style={{ marginLeft: '12px' }}>
                  <Text style={{ fontSize: '16px', fontWeight: '600' }}>{d.name}</Text>
                  <View style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    <Text style={{ color: '#FF9800' }}>★ {d.rating}</Text>
                    {d.cook_time != null && <Text>⏱ {d.cook_time}分钟</Text>}
                  </View>
                </View>
              </View>
              <Text onClick={() => onUnfavorite(d.id)} style={{ color: '#999', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}>取消收藏</Text>
            </View>
          ))}
          {loadingMore && <View style={{ textAlign: 'center', color: '#999', padding: '12px', fontSize: '13px' }}>加载中…</View>}
        </View>
      ) : (
        <View style={{ paddingTop: '15vh', textAlign: 'center' }}>
          <Empty description="还没有收藏菜品，去菜谱页逛逛吧" imageSize={120} />
          <Button block type="primary" style={{ margin: '20px auto 0', width: '180px' }} onClick={goMenu}>去逛逛</Button>
        </View>
      )}
    </View>
  )
}
