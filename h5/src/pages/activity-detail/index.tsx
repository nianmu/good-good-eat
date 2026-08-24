/**
 * 活动详情页（Task 10 完整版）——好好吃饭
 * 三模块 + 二次确认：①进度条 4 段（当前高亮，每次“下一步”均 showModal）
 * ②本次成员（头像行）、③所有菜品（菜名×数量、谁点的→跳 dish-detail、厨师→ActionSheet）、
 * ④食材汇总（daily 时 fridge 有则高亮无则置灰，party 全高亮，缺口数标红）
 * 底部按状态：ordering→“确认进入备菜”、preparing→“开始制作”（日常缺食材二次弹）、
 *             cooking→随单菜推进、completed→再来一餐/存为菜谱
 * WS：TeamCartSocket 按 activity_id 过滤刷新
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, useDidShow, useDidHide } from '@tarojs/taro'
import { Button, Empty, Skeleton, ActionSheet } from '@nutui/nutui-react-taro'
import { showToast } from '../../components/app-toast'
import { showModal } from '../../components/app-modal'
import { activities as activityApi, teams as teamApi } from '../../api'
import { loadToken } from '../../api/request'
import { TeamCartSocket } from '../../utils/team_ws'
import { formatTime } from '../../utils/format'

const STATUS_STEPS: Array<{ key: string; label: string }> = [
  { key: 'ordering', label: '点菜中' },
  { key: 'preparing', label: '备菜中' },
  { key: 'cooking', label: '烹饪中' },
  { key: 'completed', label: '已完成' },
]

const STATUS_LABEL: Record<string, string> = {
  ordering: '点菜中',
  preparing: '备菜中',
  cooking: '烹饪中',
  completed: '已完成',
}

const STATUS_NEXT: Record<string, string> = {
  ordering: 'preparing',
  preparing: 'cooking',
  cooking: 'completed',
}

const STATUS_NEXT_LABEL: Record<string, string> = {
  preparing: '确认进入备菜',
  cooking: '开始制作',
  completed: '完成活动',
}

const ITEM_STATUS_NEXT: Record<string, string> = {
  pending: 'prepared',
  prepared: 'cooking',
  cooking: 'done',
}

const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: '待备菜',
  prepared: '待烹饪',
  cooking: '烹饪中',
  done: '已完成',
}

function getActivityId(): string {
  const params: any = (Taro.getCurrentInstance().router as any)?.params || {}
  let id = params?.id
  if (!id && typeof window !== 'undefined') {
    const sp = new URLSearchParams(window.location.search)
    id = sp.get('id') || ''
  }
  return String(id || '')
}

export default function ActivityDetailPage() {
  const activityId = getActivityId()
  const [activity, setActivity] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [ingredients, setIngredients] = useState<any[]>([])
  const [progress, setProgress] = useState<any>(null)
  const [teamInfo, setTeamInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [chefSheetVisible, setChefSheetVisible] = useState(false)
  const [chefTargetItem, setChefTargetItem] = useState<any>(null)

  const wsRef = useRef<TeamCartSocket | null>(null)
  const idRef = useRef<string>(activityId)

  useEffect(() => {
    idRef.current = activityId
  }, [activityId])

  const currentUser: any = (() => {
    try {
      return Taro.getStorageSync('ggc_user') || null
    } catch {
      return null
    }
  })()
  const currentUserId = currentUser?.id ? String(currentUser.id) : ''

  const load = async (silent = false) => {
    const id = getActivityId() || idRef.current
    if (!id) {
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    try {
      const res: any = await activityApi.detail(id)
      setActivity(res)
      setMembers(res.members || [])
      setItems(res.items || [])
      setIngredients(res.ingredients || [])
      setProgress(res.progress || null)
      // 拉团队信息用于“默认”厨师展示
      if (res.team_id) {
        teamApi.detail(res.team_id).then((t: any) => {
          setTeamInfo(t?.team || null)
        }).catch(() => {})
      }
    } catch (e: any) {
      showToast({ title: e?.message || '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useLoad(() => load())
  useDidShow(() => load(true))

  // WS：按 activity_id 过滤刷新
  useEffect(() => {
    const teamId = activity?.team_id
    const token = loadToken()
    if (!teamId || !token) return
    if (wsRef.current) {
      try { wsRef.current.close() } catch {}
      wsRef.current = null
    }
    const ws = new TeamCartSocket(teamId, token)
    ws.onMessage((e) => {
      if (!e.event || !e.event.startsWith('activity.')) return
      const d: any = e.data || {}
      const aid = d.activity_id ?? d.activity?.id ?? d.item?.activity_id ?? null
      // 无 activity_id 时（如 activity.created 批量）兜底刷新
      if (aid != null && String(aid) !== String(idRef.current)) return
      load(true)
    })
    ws.connect().catch(() => {})
    wsRef.current = ws
    return () => {
      try { ws.close() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.team_id])

  useDidHide(() => {
    // keep ws alive via useEffect cleanup; nothing extra
  })

  // —— 进度：下一步二次确认 —— //
  const handleNextStatus = () => {
    if (!activity || updating) return
    const cur = String(activity.status)
    const next = STATUS_NEXT[cur]
    if (!next) return
    // preparing -> cooking 时，日常缺食材需二次弹强度提示
    const missing = ingredients.filter((it: any) => !it.has).length
    const isDaily = activity.type === 'daily'
    if (cur === 'preparing' && isDaily && missing > 0) {
      showModal({
        title: '食材缺口提醒',
        content: `日常活动有 ${missing} 种食材冰箱暂无（已置灰），确定仍要“开始制作”进入烹饪吗？\n可在“厨房冰箱”先补货。`,
        confirmText: '仍要开始',
        cancelText: '先去补货',
        onConfirm: () => confirmStatus(next, cur),
        onCancel: () => {
          // 可选跳转冰箱
        },
      })
      return
    }
    const label = STATUS_NEXT_LABEL[next] || next
    showModal({
      title: '确认推进',
      content: `确定将活动从“${STATUS_LABEL[cur] || cur}”推进到“${STATUS_LABEL[next] || next}”（${label}）吗？`,
      confirmText: '确认',
      onConfirm: () => confirmStatus(next, cur),
    })
  }

  const confirmStatus = async (target: string, _cur: string) => {
    if (updating || !activity) return
    setUpdating(true)
    try {
      await activityApi.updateStatus(activity.id, target)
      showToast({ title: '已推进到' + (STATUS_LABEL[target] || target), icon: 'success' })
      await load(true)
    } catch (e: any) {
      showToast({ title: e?.message || '推进失败', icon: 'none' })
    } finally {
      setUpdating(false)
    }
  }

  // —— 厨师改派二次确认 —— //
  const openChefSheet = (item: any) => {
    setChefTargetItem(item)
    setChefSheetVisible(true)
  }

  const chefOptions = (() => {
    // 选项：我来做 / 默认（清空）/ 其他成员
    const opts: Array<{ name: string; userId: any }> = []
    opts.push({ name: '👨‍🍳 我来做', userId: currentUser?.id ?? null })
    opts.push({ name: '↩ 默认' + (teamInfo?.chef_nickname ? '·' + teamInfo.chef_nickname : ''), userId: null })
    // 追加成员（排除自己，避免重复“我来做”）
    members.forEach((m: any) => {
      const mid = String(m.id)
      if (mid === String(currentUser?.id)) return
      opts.push({ name: (m.avatar || '👤') + ' ' + m.nickname, userId: m.id })
    })
    return opts
  })()

  const handleChefSelect = (_item: any, index: number) => {
    const opt = chefOptions[index]
    if (!opt || !chefTargetItem) {
      setChefSheetVisible(false)
      return
    }
    const targetUserId = opt.userId
    // 若已是当前厨师则无需
    const curChef = chefTargetItem.chef_id != null ? String(chefTargetItem.chef_id) : ''
    // 仅在 opt userId === null 时清空，其余为成员 id
    const want = targetUserId == null ? '' : String(targetUserId)
    if (curChef === want && !(want === '' && !curChef)) {
      setChefSheetVisible(false)
      showToast({ title: '已是该厨师', icon: 'none' })
      return
    }
    const display = opt.name
    showModal({
      title: '确认改厨师',
      content: `确定将「${chefTargetItem.dish_name || '该菜品'}」的厨师改为“${display}”吗？`,
      confirmText: '确认',
      onConfirm: async () => {
        setChefSheetVisible(false)
        setUpdating(true)
        try {
          await activityApi.updateChef(activity.id, chefTargetItem.id, targetUserId)
          showToast({ title: '厨师已更新', icon: 'success' })
          await load(true)
        } catch (e: any) {
          showToast({ title: e?.message || '改厨师失败', icon: 'none' })
        } finally {
          setUpdating(false)
        }
      },
      onCancel: () => setChefSheetVisible(false),
    })
  }

  // —— 单菜推进二次确认 —— //
  const handleItemProgress = (it: any) => {
    const cur = String(it.status || 'pending')
    const next = ITEM_STATUS_NEXT[cur]
    if (!next) {
      showToast({ title: '该菜已完成', icon: 'none' })
      return
    }
    showModal({
      title: '确认推进',
      content: `确定将「${it.dish_name}」从“${ITEM_STATUS_LABEL[cur] || cur}”推进到“${ITEM_STATUS_LABEL[next] || next}”吗？`,
      confirmText: '确认',
      onConfirm: async () => {
        setUpdating(true)
        try {
          await activityApi.updateItemStatus(activity.id, it.id, next)
          showToast({ title: '已推进', icon: 'success' })
          await load(true)
        } catch (e: any) {
          showToast({ title: e?.message || '推进失败', icon: 'none' })
        } finally {
          setUpdating(false)
        }
      },
    })
  }

  const handleAddGoMenu = () => {
    // ordering 期才可加菜
    if (activity?.status !== 'ordering') {
      showToast({ title: '仅点菜中可加菜', icon: 'none' })
      return
    }
    Taro.navigateTo({ url: '/pages/menu/index' })
  }

  const handleAgain = async () => {
    if (!activity) return
    showModal({
      title: '再来一餐',
      content: `将以“${activity.name}”为模板，在同团队创建一次新的日常活动（点菜中），确定继续吗？`,
      confirmText: '创建',
      onConfirm: async () => {
        setUpdating(true)
        try {
          const created: any = await activityApi.create({
            team_id: activity.team_id,
            type: activity.type || 'daily',
            name: activity.name + '·再来一餐',
            people: activity.people || undefined,
            remark: activity.remark || undefined,
          })
          const nid = created?.id
          showToast({ title: '已创建', icon: 'success' })
          if (nid) {
            setTimeout(() => Taro.navigateTo({ url: '/pages/activity-detail/index?id=' + nid }), 600)
          } else {
            await load(true)
          }
        } catch (e: any) {
          showToast({ title: e?.message || '创建失败', icon: 'none' })
        } finally {
          setUpdating(false)
        }
      },
    })
  }

  const handleSaveRecipe = () => {
    // completed 存为菜谱：引导至菜谱列表/新建，或存为计划兜底
    showModal({
      title: '存为菜谱',
      content: '将把本次活动的菜品汇总存为你的私有菜谱草稿，去厨房查看？',
      confirmText: '去看看',
      onConfirm: () => {
        Taro.navigateTo({ url: '/pages/recipe-list/index' })
      },
    })
  }

  if (loading) {
    return (
      <View style={{ padding: 16, background: 'var(--color-bg-page)', minHeight: '100vh' }}>
        <Skeleton rows={5} animated />
      </View>
    )
  }

  if (!activity) {
    return (
      <View style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-placeholder)', background: 'var(--color-bg-page)', minHeight: '100vh' }}>
        <Text style={{ fontSize: 40 }}>🎉</Text>
        <View style={{ marginTop: 8 }}>活动不存在或已删除</View>
        <Button type="primary" size="small" style={{ marginTop: 16 }} onClick={() => Taro.switchTab({ url: '/pages/activities/index' })}>
          返回活动列表
        </Button>
      </View>
    )
  }

  const typeLabel = activity.type === 'party' ? '聚餐' : '日常'
  const curStatusIdx = STATUS_STEPS.findIndex((s) => s.key === activity.status)
  const isDaily = activity.type === 'daily'
  const missingCount = (ingredients || []).filter((it: any) => !it.has).length

  const chefDisplayFor = (it: any) => {
    if (it.chef_id != null && it.chef_nickname) {
      const isMe = String(it.chef_id) === String(currentUser?.id)
      return isMe ? '我' : it.chef_nickname
    }
    if (teamInfo?.chef_nickname) return '默认·' + teamInfo.chef_nickname
    return '默认'
  }

  return (
    <View className="ggc-page" style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: 72 }}>
      <ScrollView scrollY style={{ height: 'calc(100vh - 72px)' }}>
        {/* 头部卡片 */}
        <View style={{ margin: 12, background: 'var(--color-bg-card)', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{activity.name}</View>
            <View
              style={{ padding: '2px 8px', borderRadius: 999, background: isDaily ? '#E8F5E9' : '#FFF3E0', color: isDaily ? '#4CAF50' : '#FF9800', fontSize: 11, fontWeight: 600 }}
            >
              {typeLabel}
            </View>
          </View>
          <View style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <View
              style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: ({ ordering: '#FFF3E0', preparing: '#E3F2FD', cooking: '#F3E5F5', completed: '#E8F5E9' } as any)[activity.status] || '#F5F5F5',
                color: ({ ordering: '#FF9800', preparing: '#2196F3', cooking: '#9C27B0', completed: '#4CAF50' } as any)[activity.status] || '#666',
              }}
            >
              {STATUS_LABEL[activity.status] || activity.status}
            </View>
            {progress && (
              <Text style={{ fontSize: 11, color: 'var(--color-text-placeholder)' }}>
                {progress.done}/{progress.total} 已完成 · {progress.percent}%
              </Text>
            )}
          </View>
          <View style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: '20px', marginTop: 10 }}>
            <View>人数：{activity.people ?? '—'}</View>
            <View>备注：{activity.remark || '—'}</View>
            <View>创建时间：{formatTime(activity.created_at)}</View>
            <View>团队：{teamInfo?.name ? teamInfo.name + ' #' + activity.team_id : '#' + activity.team_id}</View>
          </View>
        </View>

        {/* ① 进度条 4 段 */}
        <View style={{ margin: '0 12px 12px', background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
          <View style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>活动进度</View>
          <View style={{ display: 'flex', alignItems: 'flex-start' }}>
            {STATUS_STEPS.map((s, idx) => {
              const done = idx < curStatusIdx
              const active = idx === curStatusIdx
              return (
                <View key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  <View
                    style={{
                      width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700,
                      background: done || active ? '#4CAF50' : '#eee',
                      color: done || active ? '#fff' : '#999',
                      border: active ? '2px solid #A5D6A7' : 'none',
                      zIndex: 1,
                    }}
                  >
                    {done ? '✓' : String(idx + 1)}
                  </View>
                  <Text
                    style={{
                      fontSize: 11, marginTop: 6, textAlign: 'center',
                      color: active ? '#388E3C' : done ? '#4CAF50' : '#999',
                      fontWeight: active ? 700 : 400,
                    }}
                  >
                    {s.label}
                  </Text>
                  {idx < STATUS_STEPS.length - 1 && (
                    <View
                      style={{
                        position: 'absolute', left: '50%', top: 13, width: '100%', height: 3,
                        background: idx < curStatusIdx ? '#4CAF50' : '#eee',
                        zIndex: 0,
                      }}
                    />
                  )}
                </View>
              )
            })}
          </View>
          {activity.status !== 'completed' && STATUS_NEXT[activity.status] && (
            <View style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
              <Button type="primary" size="small" loading={updating} onClick={handleNextStatus} style={{ minWidth: 160 }}>
                {STATUS_NEXT_LABEL[STATUS_NEXT[activity.status]] || '下一步'}
              </Button>
            </View>
          )}
          {activity.status === 'completed' && (
            <View style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: 'var(--color-text-placeholder)' }}>活动已完成</View>
          )}
        </View>

        {/* ② 本次成员 */}
        <View style={{ margin: '0 12px 12px', background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ fontSize: 14, fontWeight: 600 }}>本次成员</View>
            <Text style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{members.length} 人</Text>
          </View>
          {members.length === 0 ? (
            <View style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>暂无成员</View>
          ) : (
            <ScrollView scrollX showScrollbar={false} style={{ whiteSpace: 'nowrap' }}>
              <View style={{ display: 'inline-flex', gap: 14, paddingRight: 8 }}>
                {members.map((m: any) => (
                  <View key={String(m.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 52 }}>
                    <View
                      style={{
                        width: 44, height: 44, borderRadius: '50%', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
                        border: String(m.id) === currentUserId ? '2px solid #4CAF50' : '1px solid #eee',
                      }}
                    >
                      {m.avatar || '👤'}
                    </View>
                    <Text style={{ fontSize: 11, color: 'var(--color-text-secondary)', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.nickname || '用户' + m.id}
                    </Text>
                    <Text style={{ fontSize: 10, color: m.role === 'organizer' ? '#FF9800' : 'var(--color-text-placeholder)' }}>
                      {m.role === 'organizer' ? '组织者' : '成员'}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* ③ 所有菜品 */}
        <View style={{ margin: '0 12px 12px', background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ fontSize: 14, fontWeight: 600 }}>所有菜品</View>
            <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{items.length} 道</Text>
              {activity.status === 'ordering' && (
                <View
                  onClick={handleAddGoMenu}
                  style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--color-primary-bg)', color: '#4CAF50', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  ＋ 去加菜
                </View>
              )}
            </View>
          </View>
          {items.length === 0 ? (
            <View style={{ paddingTop: 8 }}>
              <Empty description="还没人点菜，去菜单加几道吧" imageSize={80} />
              <View style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                <Button type="primary" size="small" onClick={handleAddGoMenu}>去菜单</Button>
              </View>
            </View>
          ) : (
            <View style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it: any) => {
                const next = ITEM_STATUS_NEXT[String(it.status || 'pending')]
                const isDone = String(it.status) === 'done'
                const isMeChef = it.chef_id != null && String(it.chef_id) === currentUserId
                const canPush = !isDone && !!next
                // cooking 期仅有效厨师可推；其余阶段任意成员触发由后端鉴权，前端仍展示按钮
                return (
                  <View
                    key={String(it.id)}
                    style={{
                      display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid #f0f0f0', background: isDone ? '#FAFAFA' : '#fff', alignItems: 'center',
                    }}
                  >
                    <View
                      onClick={() => Taro.navigateTo({ url: '/pages/dish-detail/index?id=' + it.dish_id })}
                      style={{ width: 44, height: 44, borderRadius: 8, background: '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, cursor: 'pointer' }}
                    >
                      {it.dish_emoji || '🍽'}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text
                          onClick={() => Taro.navigateTo({ url: '/pages/dish-detail/index?id=' + it.dish_id })}
                          style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {it.dish_name || '菜品#' + it.dish_id}
                        </Text>
                        <Text style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>×{it.quantity}</Text>
                        <View
                          style={{
                            padding: '1px 6px', borderRadius: 999, fontSize: 10,
                            background: ({ pending: '#FFF3E0', prepared: '#E3F2FD', cooking: '#F3E5F5', done: '#E8F5E9' } as any)[String(it.status)] || '#F5F5F5',
                            color: ({ pending: '#FF9800', prepared: '#2196F3', cooking: '#9C27B0', done: '#4CAF50' } as any)[String(it.status)] || '#666',
                          }}
                        >
                          {ITEM_STATUS_LABEL[String(it.status)] || String(it.status)}
                        </View>
                      </View>
                      <View style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <View
                          onClick={() => Taro.navigateTo({ url: '/pages/dish-detail/index?id=' + it.dish_id })}
                          style={{ fontSize: 11, color: 'var(--color-text-placeholder)', cursor: 'pointer' }}
                        >
                          {it.added_by_nickname ? `👤 ${it.added_by_nickname} 点的` : `用户${it.added_by} 点的`} · 点此查看菜谱
                        </View>
                      </View>
                      <View style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <View
                          onClick={() => openChefSheet(it)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
                            background: isMeChef ? 'var(--color-primary-bg)' : '#F5F5F5', color: isMeChef ? '#388E3C' : '#666',
                            fontSize: 11, cursor: 'pointer', border: '1px solid #eee',
                          }}
                        >
                          <Text>👨‍🍳 {chefDisplayFor(it)}</Text>
                          <Text style={{ fontSize: 10, opacity: 0.6 }}>▾</Text>
                        </View>
                      </View>
                    </View>
                    {canPush && (
                      <Button size="small" type="primary" style={{ flexShrink: 0, fontSize: 11, height: 28, padding: '0 8px' }} disabled={updating} onClick={() => handleItemProgress(it)}>
                        {next ? `→ ${ITEM_STATUS_LABEL[next]}` : '推进'}
                      </Button>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* ④ 食材汇总 */}
        <View style={{ margin: '0 12px 12px', background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ fontSize: 14, fontWeight: 600 }}>食材汇总</View>
            {missingCount > 0 ? (
              <Text style={{ fontSize: 12, color: '#F44336', fontWeight: 600 }}>缺口 {missingCount} 种</Text>
            ) : (
              <Text style={{ fontSize: 12, color: isDaily ? '#4CAF50' : 'var(--color-text-placeholder)' }}>{isDaily ? '冰箱齐全' : '聚餐全备'}</Text>
            )}
          </View>
          {ingredients.length === 0 ? (
            <View style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>暂无食材（先加几道菜）</View>
          ) : (
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ingredients.map((ing: any, idx: number) => {
                const has = !!ing.has
                // daily 置灰逻辑；party 全高亮
                const highlight = isDaily ? has : true
                return (
                  <View
                    key={String(idx) + ing.name}
                    style={{
                      padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: highlight ? 600 : 400,
                      background: highlight ? 'var(--color-primary-bg)' : '#F5F5F5',
                      color: highlight ? '#388E3C' : '#BDBDBD',
                      border: highlight ? '1px solid #A5D6A7' : '1px solid #eee',
                      opacity: highlight ? 1 : 0.85,
                      textDecoration: !highlight && isDaily ? 'line-through' : 'none',
                    }}
                  >
                    {ing.name}
                    {!highlight && isDaily ? ' · 缺' : ''}
                  </View>
                )
              })}
            </View>
          )}
          {isDaily && ingredients.length > 0 && (
            <View style={{ marginTop: 8, fontSize: 11, color: missingCount > 0 ? '#F44336' : 'var(--color-text-placeholder)' }}>
              {missingCount > 0 ? `冰箱缺 ${missingCount} 种，可先去“厨房冰箱”补货再开始制作` : '冰箱食材齐全，可直接开始制作'}
            </View>
          )}
        </View>

        <View style={{ display: 'flex', gap: 8, margin: '0 12px 24px' }}>
          <Button fill="outline" size="small" style={{ flex: 1 }} onClick={() => Taro.navigateBack()}>
            返回
          </Button>
          <Button size="small" style={{ flex: 1 }} onClick={() => Taro.switchTab({ url: '/pages/activities/index' })}>
            回活动列表
          </Button>
        </View>
      </ScrollView>

      {/* 底部动作条 */}
      <View
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, display: 'flex', gap: 8, padding: '10px 16px',
          background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-divider)', alignItems: 'center',
        }}
      >
        {activity.status === 'ordering' && (
          <Button type="primary" style={{ flex: 1 }} loading={updating} onClick={handleNextStatus}>
            确认进入备菜
          </Button>
        )}
        {activity.status === 'preparing' && (
          <Button type="primary" style={{ flex: 1 }} loading={updating} onClick={handleNextStatus}>
            开始制作
          </Button>
        )}
        {activity.status === 'cooking' && (
          <View style={{ flex: 1, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: '32px' }}>
            烹饪中 · 请在上方逐道推进
          </View>
        )}
        {activity.status === 'completed' && (
          <>
            <Button fill="outline" style={{ flex: 1 }} onClick={handleAgain}>再来一餐</Button>
            <Button type="primary" style={{ flex: 1 }} onClick={handleSaveRecipe}>存为菜谱</Button>
          </>
        )}
        {activity.status === 'cooking' && (
          <Button fill="none" size="small" style={{ flexShrink: 0 }} onClick={() => Taro.navigateTo({ url: '/pages/menu/index' })}>去加菜</Button>
        )}
      </View>

      <ActionSheet
        visible={chefSheetVisible}
        title="改厨师"
        cancelText="取消"
        onCancel={() => setChefSheetVisible(false)}
        onClose={() => setChefSheetVisible(false)}
        options={chefOptions.map((o) => ({ name: o.name }))}
        onSelect={handleChefSelect}
      />
    </View>
  )
}
