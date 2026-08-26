/**
 * 饭局详情页——好好吃饭
 * 三模块 + 二次确认：①进度条 4 段 ②本次成员（横向滚动+角色）③所有菜品（可收起，厨师指派）④食材汇总（可收起，点击切换备齐+图例提示）
 * WS：TeamCartSocket 按 activity_id 过滤刷新
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { Button, Empty, Skeleton, ActionSheet } from '@nutui/nutui-react-taro'
import { showToast } from '../../components/app-toast'
import { showModal } from '../../components/app-modal'
import { activities as activityApi, teams as teamApi, recipes } from '../../api'
import { loadToken, request } from '../../api/request'
import { TeamCartSocket } from '../../utils/team_ws'
import { formatTime } from '../../utils/format'

const STATUS_STEPS = [{ key: 'ordering', label: '点菜中' }, { key: 'preparing', label: '备菜中' }, { key: 'cooking', label: '烹饪中' }, { key: 'completed', label: '已完成' }]
const STATUS_LABEL: Record<string, string> = { ordering: '点菜中', preparing: '备菜中', cooking: '烹饪中', completed: '已完成' }
const STATUS_NEXT: Record<string, string> = { ordering: 'preparing', preparing: 'cooking', cooking: 'completed' }
const STATUS_NEXT_LABEL: Record<string, string> = { preparing: '确认进入备菜', cooking: '开始制作', completed: '完成饭局' }
const ITEM_STATUS_NEXT: Record<string, string> = { pending: 'prepared', prepared: 'cooking', cooking: 'done' }
const ITEM_STATUS_LABEL: Record<string, string> = { pending: '待备菜', prepared: '待烹饪', cooking: '烹饪中', done: '已完成' }
// 单菜推进所需的活动阶段闸门：当前状态 → 允许推进时活动必须处于的阶段
const ITEM_PHASE_GATE: Record<string, string[]> = {
  pending: ['preparing', 'cooking', 'completed'],
  prepared: ['cooking', 'completed'],
  cooking: ['cooking', 'completed'],
}
const ITEM_PHASE_HINT: Record<string, string> = {
  prepared: '进入备菜后才能标记"待烹饪"',
  cooking: '开始制作后才能推进到"烹饪中"',
  done: '开始制作后才能标记"已完成"',
}

function getActivityId(): string {
  const params: any = (Taro.getCurrentInstance().router as any)?.params || {}
  let id = params?.id
  if (!id && typeof window !== 'undefined') { id = new URLSearchParams(window.location.search).get('id') || '' }
  return String(id || '')
}

const STATUS_BG: Record<string, string> = { ordering: '#FFF3E0', preparing: '#E3F2FD', cooking: '#F3E5F5', completed: '#E8F5E9' }
const STATUS_FG: Record<string, string> = { ordering: '#FF9800', preparing: '#2196F3', cooking: '#9C27B0', completed: '#4CAF50' }
const ITEM_BG: Record<string, string> = { pending: '#FFF3E0', prepared: '#E3F2FD', cooking: '#F3E5F5', done: '#E8F5E9' }
const ITEM_FG: Record<string, string> = { pending: '#FF9800', prepared: '#2196F3', cooking: '#9C27B0', done: '#4CAF50' }

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
  const [chefSheetTitle, setChefSheetTitle] = useState('改厨师')
  const [dishesExpanded, setDishesExpanded] = useState(true)
  const [ingredientsExpanded, setIngredientsExpanded] = useState(true)
  const wsRef = useRef<TeamCartSocket | null>(null)
  const idRef = useRef(activityId)

  useEffect(() => { idRef.current = activityId }, [activityId])
  const currentUser: any = (() => { try { return Taro.getStorageSync('ggc_user') || null } catch { return null } })()
  const currentUserId = currentUser?.id ? String(currentUser.id) : ''

  const load = async (silent = false) => {
    const id = getActivityId() || idRef.current
    if (!id) { setLoading(false); return }
    if (!silent) setLoading(true)
    try {
      const res: any = await activityApi.detail(id)
      setActivity(res); setMembers(res.members || []); setItems(res.items || [])
      setIngredients(res.ingredients || []); setProgress(res.progress || null)
      if (res.team_id) teamApi.detail(res.team_id).then((t: any) => setTeamInfo(t?.team || null)).catch(() => {})
    } catch (e: any) { showToast({ title: e?.message || '加载失败', icon: 'none' }) }
    finally { setLoading(false) }
  }

  useLoad(() => load())
  useDidShow(() => load(true))

  useEffect(() => {
    const teamId = activity?.team_id; const token = loadToken()
    if (!teamId || !token) return
    if (wsRef.current) { try { wsRef.current.close() } catch {}; wsRef.current = null }
    const ws = new TeamCartSocket(teamId, token)
    ws.onMessage((e) => {
      if (!e.event || !e.event.startsWith('activity.')) return
      const d: any = e.data || {}; const aid = d.activity_id ?? d.activity?.id ?? d.item?.activity_id ?? null
      if (aid != null && String(aid) !== String(idRef.current)) return
      load(true)
    })
    ws.connect().catch(() => {}); wsRef.current = ws
    return () => { try { ws.close() } catch {} }
  }, [activity?.team_id])

  // 进度
  const handleNextStatus = () => {
    if (!activity || updating) return
    const cur = String(activity.status); const next = STATUS_NEXT[cur]
    if (!next) return
    // 关联闸门①：还没点菜不能进入备菜
    if (cur === 'ordering' && items.length === 0) { showToast({ title: '还没有点任何菜，先去点菜', icon: 'none' }); return }
    // 关联闸门②：还有菜没有有效厨师（item.chef_id 或团队默认厨师）不能开始制作
    if (cur === 'preparing' && teamInfo) {
      const teamChef = teamInfo.chef_id
      const noChef = items.filter((it: any) => it.chef_id == null && !teamChef).length
      if (noChef > 0) { showToast({ title: `还有 ${noChef} 道菜未指派厨师，请先指派后再开始制作`, icon: 'none' }); return }
    }
    const missing = ingredients.filter((it: any) => !it.has).length
    if (cur === 'preparing' && activity.type === 'daily' && missing > 0) {
      showModal({ title: '食材缺口提醒', confirmText: '仍要开始', cancelText: '先去补货', content: `日常饭局有 ${missing} 种食材冰箱暂无，确定仍要"开始制作"吗？`, onConfirm: () => doConfirmStatus(next) }); return
    }
    showModal({ title: '确认推进', confirmText: '确认', content: `确定将饭局从"${STATUS_LABEL[cur]}"推进到"${STATUS_LABEL[next]}"（${STATUS_NEXT_LABEL[next]}）吗？`, onConfirm: () => doConfirmStatus(next) })
  }
  const doConfirmStatus = async (target: string) => {
    if (updating || !activity) return; setUpdating(true)
    try { await activityApi.updateStatus(activity.id, target); showToast({ title: '已推进', icon: 'success' }); await load(true) }
    catch (e: any) { showToast({ title: e?.message || '推进失败', icon: 'none' }) }
    finally { setUpdating(false) }
  }

  // 厨师
  const openChefSheet = (item: any) => {
    if (['cooking', 'done'].includes(String(item.status || 'pending'))) { showToast({ title: '烹饪中不可再改厨师', icon: 'none' }); return }
    setChefSheetTitle(item.chef_id != null ? '改厨师' : '指派厨师'); setChefTargetItem(item); setChefSheetVisible(true)
  }
  const chefOptions = (() => {
    const o: Array<{ name: string; userId: any }> = [{ name: '👨‍🍳 我来做', userId: currentUser?.id ?? null }, { name: '↩ 暂不指定', userId: '' }]
    if (teamInfo?.chef_nickname) o.push({ name: '🏠 默认·' + teamInfo.chef_nickname, userId: null })
    members.forEach((m: any) => { if (String(m.id) === currentUserId) return; o.push({ name: (m.avatar || '👤') + ' ' + m.nickname, userId: m.id }) })
    return o
  })()
  const handleChefSelect = (_: any, idx: number) => {
    const opt = chefOptions[idx]; if (!opt || !chefTargetItem) { setChefSheetVisible(false); return }
    const targetUserId = (opt.userId === '' || opt.userId === null) ? null : opt.userId
    const curChef = chefTargetItem.chef_id != null ? String(chefTargetItem.chef_id) : ''; const want = targetUserId == null ? '' : String(targetUserId)
    if (curChef === want && !(want === '' && !curChef)) { setChefSheetVisible(false); showToast({ title: '已是该厨师', icon: 'none' }); return }
    showModal({ title: '确认改厨师', confirmText: '确认', content: `确定将「${chefTargetItem.dish_name || '该菜品'}」的厨师改为"${opt.name}"吗？`,
      onConfirm: async () => { setChefSheetVisible(false); setUpdating(true); try { await activityApi.updateChef(activity.id, chefTargetItem.id, targetUserId); showToast({ title: '厨师已更新', icon: 'success' }); await load(true) } catch (e: any) { showToast({ title: e?.message || '改厨师失败', icon: 'none' }) } finally { setUpdating(false) } },
      onCancel: () => setChefSheetVisible(false) })
  }

  // 单菜推进
  const phaseOkFor = (it: any) => {
    const gate = ITEM_PHASE_GATE[String(it.status || 'pending')]
    return !gate || gate.includes(String(activity?.status || ''))
  }
  const handleItemProgress = (it: any) => {
    const cur = String(it.status || 'pending'); const next = ITEM_STATUS_NEXT[cur]
    if (!next) { showToast({ title: '该菜已完成', icon: 'none' }); return }
    if (!phaseOkFor(it)) { showToast({ title: ITEM_PHASE_HINT[next] || '活动阶段未到，暂不能推进', icon: 'none' }); return }
    showModal({ title: '确认推进', confirmText: '确认', content: `确定将「${it.dish_name}」从"${ITEM_STATUS_LABEL[cur]}"推进到"${ITEM_STATUS_LABEL[next]}"吗？`,
      onConfirm: async () => { setUpdating(true); try { await activityApi.updateItemStatus(activity.id, it.id, next); showToast({ title: '已推进', icon: 'success' }); await load(true) } catch (e: any) { showToast({ title: e?.message || '推进失败', icon: 'none' }) } finally { setUpdating(false) } } })
  }

  // 食材
  const readyCount = (ingredients || []).filter((it: any) => it.is_ready).length
  const totalIngCount = (ingredients || []).length
  const toggleIngredientReady = async (ing: any) => {
    if (!activity) return; const nextReady = !ing.is_ready
    try {
      await request({ url: `/activities/${activity.id}/ingredients/${encodeURIComponent(ing.name)}/ready`, method: 'PUT', data: { is_ready: nextReady } })
      setIngredients((prev: any[]) => prev.map((it: any) => it.name === ing.name ? { ...it, is_ready: nextReady, has: nextReady } : it))
    } catch (e: any) { showToast({ title: e?.message || '更新失败', icon: 'none' }) }
  }

  // 去加菜
  const handleAddGoMenu = () => {
    if (!activity) return; if (!['ordering', 'cooking'].includes(activity.status)) { showToast({ title: '仅点菜中/烹饪中可加菜', icon: 'none' }); return }
    try { Taro.setStorageSync('pendingActivityId', String(activity.id)); Taro.setStorageSync('pendingActivityTeamId', String(activity.team_id)); Taro.setStorageSync('pendingActivityType', String(activity.type || 'daily')); Taro.setStorageSync('pendingActivityName', String(activity.name || '')) } catch {}
    Taro.navigateTo({ url: '/pages/menu/index' })
  }
  const handleAgain = async () => {
    if (!activity) return
    showModal({ title: '再来一餐', confirmText: '创建', content: `将以"${activity.name}"为模板，确定继续吗？`,
      onConfirm: async () => { setUpdating(true); try { const c: any = await activityApi.create({ team_id: activity.team_id, type: activity.type || 'daily', name: activity.name + '·再来一餐' }); showToast({ title: '已创建', icon: 'success' }); if (c?.id) setTimeout(() => Taro.navigateTo({ url: '/pages/activity-detail/index?id=' + c.id }), 600); else await load(true) } catch (e: any) { showToast({ title: e?.message || '创建失败', icon: 'none' }) } finally { setUpdating(false) } } })
  }
  const handleSaveRecipe = () => {
    if (!activity || updating) return
    const dishLines = (items || []).map((it: any) => `${it.dish_name || '菜品#' + it.dish_id}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`)
    const descParts: string[] = []
    if (activity.people) descParts.push(`人数：${activity.people}`)
    if (activity.remark) descParts.push(`备注：${activity.remark}`)
    showModal({
      title: '存为菜谱', confirmText: '保存',
      content: `将本次饭局「${activity.name}」的 ${dishLines.length} 道菜保存为菜谱草稿，之后可在菜谱里查看/编辑，确定吗？`,
      onConfirm: async () => {
        setUpdating(true)
        try {
          const r: any = await recipes.create({
            name: activity.name + '·饭局',
            emoji: '🍽',
            color: '#4CAF50',
            description: descParts.join('\n'),
            ingredients: dishLines,
            steps: [],
            is_public: false,
          })
          const rid = r && r.id
          showToast({ title: '已存为菜谱', icon: 'success' })
          if (rid) setTimeout(() => Taro.redirectTo({ url: '/pages/recipe-detail/index?id=' + rid }), 600)
        } catch (e: any) { showToast({ title: e?.message || '保存失败', icon: 'none' }) }
        finally { setUpdating(false) }
      }
    })
  }
  const chefDisplayFor = (it: any) => {
    if (it.chef_id != null) { return it.chef_nickname ? (String(it.chef_id) === currentUserId ? '我' : it.chef_nickname) : '我' }
    return teamInfo?.chef_nickname ? '默认·' + teamInfo.chef_nickname : ''
  }

  if (loading) return <View style={{ padding: 16, background: 'var(--color-bg-page)', minHeight: '100vh' }}><Skeleton rows={5} animated /></View>
  if (!activity) return <View style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-placeholder)', background: 'var(--color-bg-page)', minHeight: '100vh' }}><Text style={{ fontSize: 40 }}>🎉</Text><View style={{ marginTop: 8 }}>饭局不存在或已删除</View><Button type="primary" size="small" style={{ marginTop: 16 }} onClick={() => Taro.switchTab({ url: '/pages/activities/index' })}>返回饭局列表</Button></View>

  const typeLabel = activity.type === 'party' ? '聚餐饭局' : '日常饭局'
  const curStatusIdx = STATUS_STEPS.findIndex((s) => s.key === activity.status)
  const isDaily = activity.type === 'daily'

  return (
    <View className="ggc-page" style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: 72 }}>
      <ScrollView scrollY style={{ height: 'calc(100vh - 72px)' }}>
        {/* 头部 */}
        <View style={{ margin: 12, background: 'var(--color-bg-card)', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{activity.name}</View>
            <View style={{ padding: '2px 8px', borderRadius: 999, background: isDaily ? '#E8F5E9' : '#FFF3E0', color: isDaily ? '#4CAF50' : '#FF9800', fontSize: 11, fontWeight: 600 }}>{typeLabel}</View>
          </View>
          <View style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <View style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: STATUS_BG[activity.status] || '#F5F5F5', color: STATUS_FG[activity.status] || '#666' }}>{STATUS_LABEL[activity.status]}</View>
            {progress && <Text style={{ fontSize: 11, color: 'var(--color-text-placeholder)' }}>{progress.done}/{progress.total} 已完成 · {progress.percent}%</Text>}
          </View>
          <View style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: '20px', marginTop: 10 }}>
            <View>人数：{activity.people ?? '—'}</View><View>备注：{activity.remark || '—'}</View>
            <View>创建：{formatTime(activity.created_at)}</View>
            <View>团队：{teamInfo?.name || '#' + activity.team_id}</View>
          </View>
        </View>

        {/* 进度条 */}
        <View style={{ margin: '0 12px 12px', background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
          <View style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>饭局进度</View>
          <View style={{ display: 'flex' }}>
            {STATUS_STEPS.map((s, i) => {
              const done = i < curStatusIdx; const active = i === curStatusIdx
              const sub = active
                ? (s.key === 'preparing' && progress?.ingredients_total != null ? `食材 ${progress.ingredients_ready}/${progress.ingredients_total}`
                  : s.key === 'cooking' ? `${progress?.done ?? 0}/${progress?.total ?? 0} 道完成` : '')
                : ''
              return <View key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <View style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: done || active ? '#4CAF50' : '#eee', color: done || active ? '#fff' : '#999', border: active ? '2px solid #A5D6A7' : 'none', zIndex: 1 }}>{done ? '✓' : String(i + 1)}</View>
                <Text style={{ fontSize: 11, marginTop: 6, color: active ? '#388E3C' : done ? '#4CAF50' : '#999', fontWeight: active ? 700 : 400 }}>{s.label}</Text>
                {sub && <Text style={{ fontSize: 10, marginTop: 2, color: active ? '#66BB6A' : '#BDBDBD' }}>{sub}</Text>}
                {i < STATUS_STEPS.length - 1 && <View style={{ position: 'absolute', left: '50%', top: 13, width: '100%', height: 3, background: done ? '#4CAF50' : '#eee', zIndex: 0 }} />}
              </View>
            })}
          </View>
          {activity.status === 'completed' && <View style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: 'var(--color-text-placeholder)' }}>饭局已完成</View>}
        </View>

        {/* 成员 */}
        <View style={{ margin: '0 12px 12px', background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
          <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ fontSize: 14, fontWeight: 600 }}>本次成员</View>
            <Text style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>{members.length} 人</Text>
          </View>
          {members.length === 0 ? <View style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>暂无成员</View> : (
            <ScrollView scrollX showScrollbar={false} style={{ whiteSpace: 'nowrap' }}>
              <View style={{ display: 'inline-flex', gap: 14, paddingRight: 8 }}>
                {members.map((m: any) => {
                  const isChef = teamInfo?.chef_id && String(m.id) === String(teamInfo.chef_id)
                  const role = m.role === 'organizer' ? '组织者' : isChef ? '厨师' : '成员'
                  const rc = m.role === 'organizer' ? '#FF9800' : isChef ? '#4CAF50' : 'var(--color-text-placeholder)'
                  return <View key={String(m.id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 56 }}>
                    <View style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, border: String(m.id) === currentUserId ? '2px solid #4CAF50' : '1px solid #eee' }}>{m.avatar || '👤'}</View>
                    <Text style={{ fontSize: 11, maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nickname}</Text>
                    <Text style={{ fontSize: 10, color: rc }}>{role}</Text>
                  </View>
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {/* 菜品（可收起） */}
        <View style={{ margin: '0 12px 12px', background: 'var(--color-bg-card)', borderRadius: 12, overflow: 'hidden' }}>
          <View onClick={() => setDishesExpanded(!dishesExpanded)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer' }}>
            <View style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: 600 }}>所有菜品</Text>
              <Text style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>（{items.length} 道）</Text>
              <Text style={{ fontSize: 11, color: 'var(--color-text-placeholder)' }}>{dishesExpanded ? '▼' : '▶'}</Text>
            </View>
            {dishesExpanded && ['ordering', 'cooking'].includes(activity.status) && <View onClick={(e: any) => { e.stopPropagation(); handleAddGoMenu() }} style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--color-primary-bg)', color: '#4CAF50', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ 去加菜</View>}
          </View>
          {dishesExpanded && <View style={{ padding: '0 16px 16px' }}>
            {items.length === 0 ? <View><Empty description="还没人点菜" imageSize={80} /><View style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}><Button type="primary" size="small" onClick={handleAddGoMenu}>去菜单</Button></View></View> : (
              <View style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((it: any) => {
                  const next = ITEM_STATUS_NEXT[String(it.status || 'pending')]; const isDone = String(it.status) === 'done'
                  const hasChef = it.chef_id != null; const isMeChef = hasChef && String(it.chef_id) === currentUserId
                  const canPush = hasChef && !isDone && !!next && isMeChef && phaseOkFor(it)
                  return <View key={String(it.id)} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid #f0f0f0', background: isDone ? '#FAFAFA' : '#fff', alignItems: 'center' }}>
                    <View onClick={() => Taro.navigateTo({ url: '/pages/dish-detail/index?id=' + it.dish_id })} style={{ width: 44, height: 44, borderRadius: 8, background: '#FFF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, cursor: 'pointer' }}>{it.dish_emoji || '🍽'}</View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text onClick={() => Taro.navigateTo({ url: '/pages/dish-detail/index?id=' + it.dish_id })} style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{it.dish_name || '菜品#' + it.dish_id}</Text>
                        <Text style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>×{it.quantity}</Text>
                        {hasChef && <View style={{ padding: '1px 6px', borderRadius: 999, fontSize: 10, background: ITEM_BG[String(it.status)], color: ITEM_FG[String(it.status)] }}>{ITEM_STATUS_LABEL[String(it.status)]}</View>}
                      </View>
                      <View style={{ marginTop: 4, fontSize: 11, color: 'var(--color-text-placeholder)' }}>{it.added_by_nickname ? `👤 ${it.added_by_nickname} 点的` : `用户${it.added_by} 点的`}</View>
                      <View style={{ marginTop: 6 }}>
                        <View onClick={() => openChefSheet(it)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: isMeChef ? 'var(--color-primary-bg)' : !hasChef ? '#FFF3E0' : '#F5F5F5', color: isMeChef ? '#388E3C' : !hasChef ? '#FF9800' : '#666', fontSize: 11, cursor: 'pointer', border: '1px solid #eee' }}><Text>👨‍🍳 {chefDisplayFor(it)}</Text><Text style={{ fontSize: 10, opacity: 0.6 }}>▾</Text></View>
                      </View>
                    </View>
                    {canPush && <Button size="small" type="primary" style={{ flexShrink: 0, fontSize: 11, height: 28, padding: '0 8px' }} disabled={updating} onClick={() => handleItemProgress(it)}>{next ? `→ ${ITEM_STATUS_LABEL[next]}` : '推进'}</Button>}
                  </View>
                })}
              </View>
            )}
          </View>}
        </View>

        {/* 食材（可收起） */}
        <View style={{ margin: '0 12px 12px', background: 'var(--color-bg-card)', borderRadius: 12, overflow: 'hidden' }}>
          <View onClick={() => setIngredientsExpanded(!ingredientsExpanded)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer' }}>
            <View style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: 600 }}>食材汇总</Text>
              {totalIngCount > 0 && <Text style={{ fontSize: 12, color: readyCount === totalIngCount ? '#4CAF50' : '#FF9800', fontWeight: 600 }}>已备齐 {readyCount}/{totalIngCount}</Text>}
              <Text style={{ fontSize: 11, color: 'var(--color-text-placeholder)' }}>{ingredientsExpanded ? '▼' : '▶'}</Text>
            </View>
          </View>
          {ingredientsExpanded && <View style={{ padding: '0 16px 16px' }}>
            {ingredients.length === 0 ? <View style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>暂无食材</View> : (
              <>
                <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ingredients.map((ing: any, idx: number) => {
                    const fridgeHas = !!ing.has; const ready = !!ing.is_ready
                    let bg = '#F5F5F5', tc = '#BDBDBD', bc = '#eee', dec = 'none', lbl = ''
                    if (isDaily) {
                      if (fridgeHas && ready) { bg = 'var(--color-primary-bg)'; tc = '#388E3C'; bc = '#A5D6A7'; lbl = '' }
                      else if (fridgeHas && !ready) { bg = '#E8F5E9'; tc = '#4CAF50'; bc = '#C8E6C9'; lbl = '' }
                      else if (!fridgeHas && !ready) { bg = '#F5F5F5'; tc = '#BDBDBD'; bc = '#eee'; dec = 'line-through'; lbl = ' · 缺' }
                      else { bg = '#FFF3E0'; tc = '#FF9800'; bc = '#FFE0B2'; lbl = ' · 已购' }
                    } else { bg = ready ? 'var(--color-primary-bg)' : '#F5F5F5'; tc = ready ? '#388E3C' : '#BDBDBD'; bc = ready ? '#A5D6A7' : '#eee' }
                    return <View key={String(idx) + ing.name} onClick={() => toggleIngredientReady(ing)} style={{ padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: ready ? 600 : 400, background: bg, color: tc, border: `1px solid ${bc}`, opacity: (!fridgeHas && !ready && isDaily) ? 0.85 : 1, textDecoration: dec, cursor: 'pointer' }}>{ing.name}{lbl}</View>
                  })}
                </View>
                {ingredients.length > 0 && <View style={{ marginTop: 8, fontSize: 11, color: readyCount < totalIngCount ? '#FF9800' : 'var(--color-text-placeholder)' }}>
                  {readyCount < totalIngCount ? `还有 ${totalIngCount - readyCount} 种未备齐，点击标签标记已购买` : (isDaily ? '食材齐全' : '全部已备齐')}
                </View>}
                {ingredients.length > 0 && <View style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {isDaily ? <>
                    <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 4, background: '#A5D6A7' }} /><Text style={{ fontSize: 10, color: 'var(--color-text-placeholder)' }}>已有</Text></View>
                    <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 4, background: '#E8F5E9' }} /><Text style={{ fontSize: 10, color: 'var(--color-text-placeholder)' }}>有货未备齐</Text></View>
                    <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 4, background: '#F5F5F5', border: '1px solid #eee' }} /><Text style={{ fontSize: 10, color: 'var(--color-text-placeholder)' }}>冰箱缺</Text></View>
                    <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 4, background: '#FFF3E0' }} /><Text style={{ fontSize: 10, color: 'var(--color-text-placeholder)' }}>已购买</Text></View>
                  </> : <>
                    <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 4, background: '#A5D6A7' }} /><Text style={{ fontSize: 10, color: 'var(--color-text-placeholder)' }}>已备齐</Text></View>
                    <View style={{ display: 'flex', alignItems: 'center', gap: 4 }}><View style={{ width: 10, height: 10, borderRadius: 4, background: '#F5F5F5', border: '1px solid #eee' }} /><Text style={{ fontSize: 10, color: 'var(--color-text-placeholder)' }}>待准备</Text></View>
                  </>}
                  <Text style={{ fontSize: 10, color: '#BDBDBD' }}>👆 点击标签切换</Text>
                </View>}
              </>
            )}

          </View>}
        </View>
      </ScrollView>

      {/* 底部动作条 */}
      <View style={{ position: 'fixed', left: 0, right: 0, bottom: 0, display: 'flex', gap: 8, padding: '10px 16px', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-divider)', alignItems: 'center' }}>
        {activity.status === 'ordering' && <Button type="primary" style={{ flex: 1 }} loading={updating} onClick={handleNextStatus}>确认进入备菜</Button>}
        {activity.status === 'preparing' && <Button type="primary" style={{ flex: 1 }} loading={updating} onClick={handleNextStatus}>开始制作</Button>}
        {activity.status === 'cooking' && (() => { const n = items.filter((it: any) => it.chef_id == null).length; return <View style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>烹饪中 · 逐道推进</Text>{n > 0 && <Text style={{ fontSize: 11, color: '#FF9800', marginTop: 2 }}>⚠ {n} 道菜尚未指派厨师</Text>}</View> })()}
        {activity.status === 'completed' && <><Button fill="outline" style={{ flex: 1 }} onClick={handleAgain}>再来一餐</Button><Button type="primary" style={{ flex: 1 }} onClick={handleSaveRecipe}>存为菜谱</Button></>}
      </View>

      <ActionSheet visible={chefSheetVisible} title={chefSheetTitle} cancelText="取消" onCancel={() => setChefSheetVisible(false)} onClose={() => setChefSheetVisible(false)} options={chefOptions.map((o) => ({ name: o.name }))} onSelect={handleChefSelect} />
    </View>
  )
}
