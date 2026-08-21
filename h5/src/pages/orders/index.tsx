/**
 * 订单列表页（TabBar·订单）——好好吃饭 跨端 H5
 * - 顶部状态筛选（全部/待接单/制作中/待取餐/已完成）
 * - 分页加载：useReachBottom 触发加载更多
 * - 下拉刷新（NutUI PullToRefresh）；角色切换入口 → chef-board
 * - 卡片：状态徽章(NutUI Tag) / 取餐码 / 时间 / 金额(NutUI Price) / 菜品摘要
 * 对齐原生小程序 pages/orders。
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { Empty, Skeleton, Price } from '@nutui/nutui-react-taro'
import { request, guestLogin } from '../../api/request'
import StatusTag from '../../components/status-tag'
import { formatTime, dishSummary } from '../../utils/format'

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待接单' },
  { key: 'cooking', label: '制作中' },
  { key: 'ready', label: '待取餐' },
  { key: 'completed', label: '已完成' }
]
const PAGE_SIZE = 8

function normalize(o: any) {
  const num = Number(o.total_amount)
  return {
    id: o.id,
    pickup_code: o.pickup_code,
    status: o.status,
    team_name: o.team_name || '',
    summary: dishSummary(o.items),
    time_text: formatTime(o.created_at),
    amount_text: Number.isNaN(num) ? '0.00' : num.toFixed(2)
  }
}

export default function OrdersPage() {
  const [status, setStatus] = useState('')
  const [orders, setOrders] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const firstShow = useRef(true)
  const busy = useRef(false)

  // 拉取指定页并合并：reset=true 覆盖列表
  async function fetchPage(targetPage: number, reset: boolean) {
    try {
      await guestLogin().catch(() => null)
      const res: any = await request({
        url: '/orders',
        data: { page: targetPage, page_size: PAGE_SIZE, status }
      })
      const items = (res.items || []).map(normalize)
      setOrders((prev) => (reset ? items : prev.concat(items)))
      setPage(res.page || targetPage)
      setHasMore(!!res.has_more)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      setRefreshing(false)
      busy.current = false
    }
  }

  async function loadOrders(reset: boolean, silent = false) {
    if (busy.current) return
    busy.current = true
    if (reset && !silent) setLoading(true)
    const targetPage = reset ? 1 : page + 1
    try {
      await fetchPage(targetPage, reset)
    } catch (e: any) {
      showToast({ title: e?.message || '加载失败', icon: 'none' })
      setLoading(false)
      setLoadingMore(false)
      busy.current = false
    }
  }

  // 首次加载
  useEffect(() => {
    if (firstShow.current) loadOrders(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 从详情返回刷新
  useDidShow(() => {
    if (!firstShow.current) loadOrders(true, true)
    firstShow.current = false
  })

  useReachBottom(() => {
    if (loading || loadingMore || !hasMore) return
    setLoadingMore(true)
    loadOrders(false)
  })

  function onStatusTap(key: string) {
    if (key === status) return
    setStatus(key)
    setLoading(true)
    busy.current = false
    ;(async () => {
      setOrders([])
      setHasMore(true)
      try {
        await guestLogin().catch(() => null)
        const res: any = await request({
          url: '/orders',
          data: { page: 1, page_size: PAGE_SIZE, status: key }
        })
        setOrders((res.items || []).map(normalize))
        setPage(res.page || 1)
        setHasMore(!!res.has_more)
        setLoading(false)
        setLoadingMore(false)
      } catch (e: any) {
        showToast({ title: e?.message || '加载失败', icon: 'none' })
        setLoading(false)
        setLoadingMore(false)
      } finally {
        busy.current = false
      }
    })()
  }

  function onOrderTap(id: number | string) {
    Taro.navigateTo({ url: '/pages/order-detail/index?id=' + id })
  }

  function onRoleTap() {
    Taro.navigateTo({ url: '/pages/chef-board/index' })
  }

  function goMenu() {
    Taro.switchTab({ url: '/pages/menu/index' })
  }

  return (
    <View className="ggc-page ggc-tabbar-page" style={{ minHeight: '100vh', background: '#F5F5F5' }}>
      {/* 顶部状态筛选 */}
      <ScrollView scrollX show-scrollbar={false} style={{ background: '#fff', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
        <View style={{ display: 'inline-flex', padding: '8px 8px 0' }}>
          {STATUS_TABS.map((t) => (
            <View
              key={t.key || 'all'}
              onClick={() => onStatusTap(t.key)}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                color: status === t.key ? '#4CAF50' : '#666',
                fontWeight: status === t.key ? 600 : 400,
                position: 'relative'
              }}
            >
              {t.label}
              {status === t.key && (
                <View style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 0, width: 24, height: 3, borderRadius: 3, background: '#4CAF50' }} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 角色切换入口 */}
      <View
        onClick={onRoleTap}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#fff', borderBottom: '1px solid #eee' }}
      >
        <Text style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>我的订单</Text>
        <Text style={{ fontSize: '12px', color: '#999' }}>切换为厨师看板 ›</Text>
      </View>

      {/* 列表主体 */}
      <ScrollView
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={() => { setRefreshing(true); loadOrders(true, true) }}
        style={{ padding: '12px', minHeight: '50vh' }}
      >
        {loading && orders.length === 0 ? (
          <View style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
            <Skeleton rows={4} animated />
          </View>
        ) : orders.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <Empty description="暂无订单，去菜谱页点几道菜吧" status="order"
              actions={[{ text: '去点菜', type: 'primary', onClick: () => goMenu() }]} />
          </View>
        ) : (
          <View>
            {orders.map((o) => (
              <View
                key={o.id}
                onClick={() => onOrderTap(o.id)}
                style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusTag status={o.status} />
                    <Text style={{ fontSize: 12, color: '#999' }}>{o.team_name}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: 600, color: '#388E3C' }}>取餐码 {o.pickup_code}</Text>
                </View>
                <View style={{ fontSize: 15, fontWeight: 500, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.summary}
                </View>
                <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: '#999' }}>{o.time_text}</Text>
                  <Price price={Number(o.amount_text)} symbol="¥" thousands={false} />
                </View>
              </View>
            ))}

            <View style={{ padding: '12px 0 40px', textAlign: 'center', fontSize: 12, color: '#999' }}>
              {loadingMore ? '加载中…' : !hasMore ? '—— 没有更多订单了 ——' : '上拉加载更多'}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
