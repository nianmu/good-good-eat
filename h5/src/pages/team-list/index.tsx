/**
 * 团队列表页——好好吃饭 跨端 H5
 * - 我的团队列表（teams.my，来自 /me）
 * - 创建团队（teams.create，输入名称）
 * - 加入团队（teams.join，输入邀请码）
 * - 点团队卡 → team-detail
 * 对齐原生小程序 pages/team-list。
 */
import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { Button, Empty, Input, Skeleton, TextArea } from '@nutui/nutui-react-taro'
import { teams, guestLogin } from '../../api'
import { requireLogin } from '../../utils/auth'

const TEAM_ICONS = ['🏠', '🍽', '🎓']
const ROLE_LABELS: Record<string, string> = { organizer: '组织者', member: '成员' }

function normalizeTeams(list: any[]) {
  return (list || []).map((t: any, idx: number) => ({
    id: t.id,
    name: t.name,
    icon: t.icon || TEAM_ICONS[idx % TEAM_ICONS.length],
    role_label: ROLE_LABELS[t.role] || '成员',
    member_count: t.member_count || 0,
    chef: t.chef || null,
    invite_code: t.invite_code || ''
  }))
}

export default function TeamListPage() {
  const [teamList, setTeamList] = useState<any[]>([])
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loaded = useRef(false)

  async function loadTeams() {
    setLoading(true)
    try {
      await guestLogin().catch(() => null)
      const r: any = await teams.my()
      setTeamList(normalizeTeams(r))
      setLoading(false)
      setRefreshing(false)
    } catch (e: any) {
      showToast({ title: e?.message || '加载失败', icon: 'none' })
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTeams()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useDidShow(() => {
    if (loaded.current) loadTeams()
    loaded.current = true
  })

  async function onCreate() {
    if (!requireLogin('创建团队需要登录')) return
    if (submitting) return
    const name = (createName || '').trim()
    if (!name) {
      showToast({ title: '请输入团队名称', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const desc = (createDesc || '').trim() || undefined
      const team: any = await teams.create(name, desc)
      setCreateName('')
      setCreateDesc('')
      setSubmitting(false)
      showToast({ title: '创建成功，邀请码 ' + team.invite_code, icon: 'none' })
      loadTeams()
    } catch (e: any) {
      showToast({ title: e?.message || '创建失败', icon: 'none' })
      setSubmitting(false)
    }
  }

  async function onJoin() {
    if (!requireLogin('加入团队需要登录')) return
    if (submitting) return
    const code = (joinCode || '').trim()
    if (!code) {
      showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      const team: any = await teams.join(code)
      setJoinCode('')
      setSubmitting(false)
      showToast({ title: '已加入「' + team.name + '」', icon: 'none' })
      loadTeams()
    } catch (e: any) {
      showToast({ title: e?.message || '加入失败', icon: 'none' })
      setSubmitting(false)
    }
  }

  function onTeamTap(id: number | string) {
    Taro.navigateTo({ url: '/pages/team-detail/index?id=' + id })
  }

  return (
    <ScrollView
      scrollY
      refresherEnabled
      refresherTriggered={refreshing}
      onRefresherRefresh={() => { setRefreshing(true); loadTeams() }}
      style={{ height: '100vh', background: 'var(--color-bg-page)' }}
    >
      <View style={{ padding: 12 }}>
        {/* 创建团队 */}
        <View style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
          <View style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>创建团队</View>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, background: 'var(--color-bg-page)', borderRadius: 6, padding: '0 4px' }}>
              <Input
                value={createName}
                placeholder="输入团队名称"
                maxLength={20}
                onChange={(v) => setCreateName(v || '')}
              />
            </View>
            <Button size="small" type="primary" loading={submitting} onClick={onCreate}>创建</Button>
          </View>
          <View style={{ marginTop: 8, background: 'var(--color-bg-page)', borderRadius: 6, padding: '4px 8px' }}>
            <TextArea
              value={createDesc}
              placeholder="团队描述（可选）"
              maxLength={100}
              onChange={(v) => setCreateDesc(v || '')}
              style={{ width: '100%' }}
            />
          </View>
        </View>

        {/* 加入团队 */}
        <View style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
          <View style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>加入团队</View>
          <View style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, background: 'var(--color-bg-page)', borderRadius: 6, padding: '0 4px' }}>
              <Input
                value={joinCode}
                placeholder="输入 8 位邀请码"
                maxLength={8}
                onChange={(v) => setJoinCode(v || '')}
              />
            </View>
            <Button size="small" loading={submitting} onClick={onJoin}>加入</Button>
          </View>
        </View>

        {/* 我的团队 */}
        <View style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '4px 8px 8px' }}>我的团队（{teamList.length}）</View>

        {loading && teamList.length === 0 ? (
          <View style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
            <Skeleton rows={3} animated />
          </View>
        ) : teamList.length === 0 ? (
          <View style={{ paddingTop: 24 }}>
            <Empty description="还没有团队，创建或加入一个吧" status="shop" />
          </View>
        ) : (
          teamList.map((t) => (
            <View
              key={t.id}
              onClick={() => onTeamTap(t.id)}
              style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                {t.icon}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ flexShrink: 0 }}>{t.name}</Text>
                  <Text style={{ fontSize: 11, color: '#4CAF50', background: 'var(--color-primary-bg)', padding: '1px 8px', borderRadius: 999 }}>{t.role_label}</Text>
                </View>
                <View style={{ fontSize: 12, color: 'var(--color-text-placeholder)', lineHeight: 1.7 }}>{t.member_count} 位成员 · 厨师：{t.chef || '待认领'}</View>
                <View style={{ fontSize: 12, color: 'var(--color-text-placeholder)', lineHeight: 1.7 }}>邀请码：{t.invite_code || '—'}</View>
              </View>
              <Text style={{ color: 'var(--color-text-placeholder)', fontSize: 18 }}>›</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}
