/**
 * 活动列表页（TabBar·活动）——好好吃饭 跨端 H5
 * 替代原订单 Tab，对齐 Spec 第 5 节
 * - 顶部状态筛选（全部/点菜中/备菜中/烹饪中/已完成）
 * - 团队筛：当前团队来自 store.currentTeamId
 * - 分页加载：useReachBottom + total 判定；下拉刷新
 * - WS 订阅 activity.* 自动刷新
 * - 卡片：name + type + status + progress（百分比进度条），点击跳 activity-detail
 * 参考 h5/src/pages/orders/index.tsx 列表+分页+WS 模式
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useDidHide, useLoad, useReachBottom } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { Empty, Skeleton } from '@nutui/nutui-react-taro'
import { request, guestLogin, loadToken } from '../../api/request'
import { store } from '../../store'
import { TeamCartSocket } from '../../utils/team_ws'
import { formatTime } from '../../utils/format'

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'ordering', label: '点菜中' },
  { key: 'preparing', label: '备菜中' },
  { key: 'cooking', label: '烹饪中' },
  { key: 'completed', label: '已完成' },
]

const TYPE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  daily: { label: '日常', color: '#4CAF50', bg: '#E8F5E9' },
  party: { label: '聚餐', color: '#FF9800', bg: '#FFF3E0' },
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ordering: { label: '点菜中', color: '#FF9800', bg: '#FFF3E0' },
  preparing: { label: '备菜中', color: '#2196F3', bg: '#E3F2FD' },
  cooking: { label: '烹饪中', color: '#9C27B0', bg: '#F3E5F5' },
  completed: { label: '已完成', color: '#4CAF50', bg: '#E8F5E9' },
}

const PROGRESS_PERCENT: Record<string, number> = {
  ordering: 25,
  preparing: 50,
  cooking: 75,
  completed: 100,
}

const PAGE_SIZE = 10

function normalize(a: any) {
  const st = String(a.status || '')
  const tp = String(a.type || 'daily')
  const prog = PROGRESS_PERCENT[st] ?? 0
  return {
    id: a.id,
    name: a.name || '未命名活动',
    type: tp,
    typeLabel: TYPE_MAP[tp]?.label || tp,
    status: st,
    statusLabel: STATUS_MAP[st]?.label || st,
    progress: prog,
    people: a.people ?? null,
    remark: a.remark || '',
    team_id: a.team_id,
    created_at: a.created_at || '',
    time_text: formatTime(a.created_at),
  }
}

export default function ActivitiesPage() {
  const [status, setStatus] = useState('')
  const [activities, setActivities] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const busy = useRef(false)
  const wsRef = useRef<TeamCartSocket | null>(null)

  async function fetchPage(targetPage: number, reset: boolean, statusKey: string) {
    try {
      await guestLogin().catch(() => null)
      const teamId = (store.get('currentTeamId') as any) || Taro.getStorageSync('ggc_team') || ''
      const data: any = { page: targetPage, page_size: PAGE_SIZE }
      if (statusKey) data.status = statusKey
      if (teamId) data.team_id = teamId
      const res: any = await request({ url: '/activities', data })
      const items = (res.items || []).map(normalize)
      setActivities((prev) => (reset ? items : prev.concat(items)))
      setPage(res.page || targetPage)
      setTotal(res.total || 0)
      const t = res.total ?? 0
      const p = res.page || targetPage
      const ps = res.page_size || PAGE_SIZE
      setHasMore(p * ps < t && items.length === ps ? true : p * ps < t)
      // fallback: if total not reliable, use items length
      if (t === 0 && items.length > 0) {
        setHasMore(items.length === ps)
      } else if (items.length < ps) {
        setHasMore(false)
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
      setRefreshing(false)
      busy.current = false
    }
  }

  async function loadActivities(reset: boolean, silent = false, statusKey?: string) {
    if (busy.current) return
    busy.current = true
    const sk = statusKey !== undefined ? statusKey : status
    if (reset && !silent) setLoading(true)
    const targetPage = reset ? 1 : page + 1
    try {
      await fetchPage(targetPage, reset, sk)
    } catch (e: any) {
      showToast({ title: e?.message || '加载失败', icon: 'none' })
      setLoading(false)
      setLoadingMore(false)
      setRefreshing(false)
      busy.current = false
    }
  }

  useLoad(() => {
    loadActivities(true)
  })

  useEffect(() => {
    // status 变更兜底（主要由 onStatusTap 驱动）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDidShow(() => {
    busy.current = false
    loadActivities(true, true)
    const teamId = (store.get('currentTeamId') as any) || Taro.getStorageSync('ggc_team') || ''
    const token = loadToken()
    if (!teamId || !token) return
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {}
      wsRef.current = null
    }
    const ws = new TeamCartSocket(teamId, token)
    ws.onMessage((e) => {
      if (e.event && e.event.startsWith('activity.')) {
        busy.current = false
        loadActivities(true, true)
      }
    })
    ws.connect().catch(() => {})
    wsRef.current = ws
  })

  useDidHide(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {}
      wsRef.current = null
    }
  })

  useReachBottom(() => {
    if (loading || loadingMore || !hasMore) return
    setLoadingMore(true)
    loadActivities(false)
  })

  function onStatusTap(key: string) {
    if (key === status) return
    setStatus(key)
    setLoading(true)
    busy.current = false
    setActivities([])
    setHasMore(true)
    setTotal(0)
    ;(async () => {
      try {
        await guestLogin().catch(() => null)
        await fetchPage(1, true, key)
      } catch (e: any) {
        showToast({ title: e?.message || '加载失败', icon: 'none' })
        setLoading(false)
        setLoadingMore(false)
        busy.current = false
      }
    })()
  }

  function onActivityTap(id: number | string) {
    Taro.navigateTo({ url: '/pages/activity-detail/index?id=' + id })
  }

  function goMenu() {
    Taro.switchTab({ url: '/pages/menu/index' })
  }

  return (
    <View className="ggc-page ggc-tabbar-page" style={{ minHeight: '100vh', background: 'var(--color-bg-page)' }}>
      {/* 顶部状态 Tab */}
      <ScrollView scrollX show-scrollbar={false} style={{ background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-divider)', whiteSpace: 'nowrap' }}>
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
                position: 'relative',
              }}
            >
              {t.label}
              {status === t.key && (
                <View
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    bottom: 0,
                    width: 24,
                    height: 3,
                    borderRadius: 3,
                    background: '#4CAF50',
                  }}
                />
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 列表主体 */}
      <ScrollView
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={() => {
          setRefreshing(true)
          loadActivities(true, true)
        }}
        style={{ padding: '12px', minHeight: '50vh' }}
      >
        {loading && activities.length === 0 ? (
          <View style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
            <Skeleton rows={4} animated />
          </View>
        ) : activities.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <Empty
              description="暂无活动，去创建一个吧"
              status="order"
              actions={[{ text: '去看看菜谱', type: 'primary', onClick: () => goMenu() }]}
            />
          </View>
        ) : (
          <View>
            {activities.map((a) => {
              const typeStyle = TYPE_MAP[a.type] || { label: a.type, color: '#666', bg: '#F5F5F5' }
              const stStyle = STATUS_MAP[a.status] || { label: a.status, color: '#666', bg: '#F5F5F5' }
              return (
                <View
                  key={a.id}
                  onClick={() => onActivityTap(a.id)}
                  style={{
                    background: 'var(--color-bg-card)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 12,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                >
                  <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: typeStyle.bg,
                          color: typeStyle.color,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {typeStyle.label}
                      </View>
                      <View
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: stStyle.bg,
                          color: stStyle.color,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {stStyle.label}
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: 'var(--color-text-placeholder)' }}>{a.time_text}</Text>
                  </View>

                  <View style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.name}
                  </View>

                  <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    {a.people ? (
                      <Text style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{a.people} 人</Text>
                    ) : null}
                    {a.remark ? (
                      <Text style={{ fontSize: 12, color: 'var(--color-text-placeholder)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {a.remark}
                      </Text>
                    ) : null}
                  </View>

                  {/* progress */}
                  <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, height: 6, borderRadius: 999, background: '#F0F0F0', overflow: 'hidden' }}>
                      <View style={{ width: `${a.progress}%`, height: '100%', background: a.status === 'completed' ? '#4CAF50' : '#FFC107', borderRadius: 999, transition: 'width 0.3s' }} />
                    </View>
                    <Text style={{ fontSize: 11, color: 'var(--color-text-placeholder)', minWidth: 28, textAlign: 'right' }}>{a.progress}%</Text>
                  </View>
                </View>
              )
            })}

            <View style={{ padding: '12px 0 40px', textAlign: 'center', fontSize: 12, color: 'var(--color-text-placeholder)' }}>
              {loadingMore ? '加载中…' : !hasMore ? '—— 没有更多活动了 ——' : '上拉加载更多'}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
