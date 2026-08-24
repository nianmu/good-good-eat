import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useLoad, useReachBottom } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Empty, Skeleton } from '@nutui/nutui-react-taro'
import { favorites, recipes } from '../../api'

//
// 我的收藏页——菜品收藏 + 菜谱收藏（最终版）
//

type Owner = 'dishes' | 'recipes'

export default function FavoritesPage() {
  const [owner, setOwner] = useState<Owner>('dishes')
  const [list, setList] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    const call = owner === 'dishes' ? favorites.list() : recipes.favoritesList()
    call.then((res: any) => {
      setList(res.items || [])
      setTotal(res.total || 0)
    }).catch(() => showToast({ title: '收藏加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  }

  useLoad(() => load())
  useDidShow(() => load())

  const switchOwner = (o: Owner) => {
    if (o === owner) return
    setOwner(o)
    setList([])
    setLoading(true)
    const call = o === 'dishes' ? favorites.list() : recipes.favoritesList()
    call.then((res: any) => {
      setList(res.items || [])
      setTotal(res.total || 0)
    }).catch(() => showToast({ title: '收藏加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  }

  const goItem = (item: any) => {
    if (owner === 'dishes') Taro.navigateTo({ url: `/pages/dish-detail/index?id=${item.id}` })
    else Taro.navigateTo({ url: `/pages/recipe-detail/index?id=${item.id}` })
  }

  const onUnfavorite = (id: any) => {
    const call = owner === 'dishes' ? favorites.remove(id) : recipes.unfavorite(id)
    call.then(() => load()).catch(() => showToast({ title: '操作失败', icon: 'none' }))
  }

  const emptyText = owner === 'dishes' ? '还没有收藏菜品，去菜谱页逛逛吧' : '还没有收藏菜谱，去公开菜谱库看看吧'
  const label = owner === 'dishes' ? '道' : '份'

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '20px' }}>
      {/* 顶部 Tab */}
      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 8px' }}>
        <Text style={{ fontSize: '17px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>我的收藏</Text>
        {total > 0 && <Text style={{ fontSize: '13px', color: 'var(--color-text-placeholder)' }}>共 {total} {label}</Text>}
      </View>
      <View style={{ display: 'flex', gap: '10px', padding: '0 16px 8px' }}>
        <View onClick={() => switchOwner('dishes')} style={{
          padding: '6px 16px', borderRadius: '16px', fontSize: '13px', cursor: 'pointer',
          background: owner === 'dishes' ? '#4CAF50' : 'var(--color-bg-card)', color: owner === 'dishes' ? '#fff' : 'var(--color-text-secondary)'
        }}>菜品</View>
        <View onClick={() => switchOwner('recipes')} style={{
          padding: '6px 16px', borderRadius: '16px', fontSize: '13px', cursor: 'pointer',
          background: owner === 'recipes' ? '#4CAF50' : 'var(--color-bg-card)', color: owner === 'recipes' ? '#fff' : 'var(--color-text-secondary)'
        }}>菜谱</View>
      </View>

      {loading ? (
        <View style={{ padding: '16px' }}><Skeleton rows={4} animated /></View>
      ) : list.length > 0 ? (
        <View style={{ padding: '0 12px' }}>
          {list.map((item) => (
            <View key={item.id} style={{ background: 'var(--color-bg-card)', borderRadius: '12px', padding: '12px', marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
              <View onClick={() => goItem(item)} style={{ display: 'flex', flex: 1, alignItems: 'center', cursor: 'pointer' }}>
                <View style={{ width: '52px', height: '52px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', background: item.color || '#E8F5E9' }}>{item.emoji}</View>
                <View style={{ marginLeft: '12px' }}>
                  <Text style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{item.name}</Text>
                  <View style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--color-text-placeholder)', marginTop: '4px' }}>
                    {item.rating != null && <Text style={{ color: '#FF9800' }}>★ {item.rating}</Text>}
                    {item.cook_time != null && <Text>⏱ {item.cook_time}分钟</Text>}
                    {item.difficulty && <Text>{item.difficulty}</Text>}
                  </View>
                </View>
              </View>
              <Text onClick={() => onUnfavorite(item.id)} style={{ color: 'var(--color-text-placeholder)', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}>取消收藏</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ paddingTop: '15vh', textAlign: 'center' }}>
          <Empty description={emptyText} imageSize={120} />
          <Button block type="primary" style={{ margin: '20px auto 0', width: '180px' }} onClick={() => Taro.switchTab({ url: '/pages/menu/index' })}>去逛逛</Button>
        </View>
      )}
    </View>
  )
}
