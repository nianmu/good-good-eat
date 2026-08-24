import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useLoad, useReachBottom } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Empty, Skeleton } from '@nutui/nutui-react-taro'
import { plans } from '../../api'

//
// 我的饮食计划列表页——对齐原生 miniprogram/pages/plans
//

const PAGE_SIZE = 10

export default function PlansPage() {
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
    plans.list().then((res: any) => {
      const items = res.items || []
      setList(reset ? items : (prev: any[]) => prev.concat(items))
      setTotal(res.total || 0)
      setPage(p + 1)
      setHasMore(items.length >= PAGE_SIZE)
    }).catch(() => showToast({ title: '计划加载失败', icon: 'none' }))
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }

  useLoad(() => load(true))
  useDidShow(() => load(true))
  useReachBottom(() => load(false))

  const goDetail = (id: any) => Taro.navigateTo({ url: `/pages/plan-detail/index?id=${id}` })
  const goCreate = () => Taro.navigateTo({ url: '/pages/plan-edit/index' })

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '80px' }}>
      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
        <Text style={{ fontSize: '17px', fontWeight: 'bold' }}>我的饮食计划</Text>
        {total > 0 && <Text style={{ fontSize: '13px', color: 'var(--color-text-placeholder)' }}>共 {total} 份</Text>}
      </View>

      {loading ? (
        <View style={{ padding: '16px' }}><Skeleton rows={4} animated /></View>
      ) : list.length > 0 ? (
        <View style={{ padding: '0 12px' }}>
          {list.map((p) => (
            <View key={p.id} onClick={() => goDetail(p.id)} style={{ background: 'var(--color-bg-card)', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', cursor: 'pointer' }}>
              <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: '16px', fontWeight: 'bold' }}>{p.name}</Text>
                {p.total_count != null && <Text style={{ fontSize: '12px', color: '#4CAF50', background: 'var(--color-primary-bg)', padding: '2px 8px', borderRadius: '10px' }}>共 {p.total_count} 份</Text>}
              </View>
              {p.note && <Text style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-placeholder)', marginTop: '4px' }}>{p.note}</Text>}
              {(p.summary || []).length > 0 && (
                <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                  {(p.summary || []).map((s: any, i: number) => (
                    <Text key={s.dish_id ?? i} style={{ background: 'var(--color-bg-page)', color: 'var(--color-text-secondary)', padding: '3px 10px', borderRadius: '12px', fontSize: '12px' }}>
                      {s.emoji ? `${s.emoji} ` : ''}{s.name}{s.quantity > 1 ? ` ×${s.quantity}` : ''}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ))}
          {loadingMore && <View style={{ textAlign: 'center', color: 'var(--color-text-placeholder)', padding: '12px', fontSize: '13px' }}>加载中…</View>}
        </View>
      ) : (
        <View style={{ paddingTop: '15vh', textAlign: 'center' }}>
          <Empty description="还没有饮食计划，创建一份吧" imageSize={120} />
          <Button block type="primary" style={{ margin: '20px auto 0', width: '180px' }} onClick={goCreate}>新建计划</Button>
        </View>
      )}

      <View onClick={goCreate} style={{
        position: 'fixed', right: '20px', bottom: '40px', width: '52px', height: '52px', borderRadius: '50%',
        background: '#4CAF50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px', boxShadow: '0 4px 12px rgba(76,175,80,0.4)', cursor: 'pointer', zIndex: 10
      }}>＋</View>
    </View>
  )
}
