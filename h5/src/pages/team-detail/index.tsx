/**
 * 团队详情页——好好吃饭 跨端 H5
 * - 团队信息（名称 / 角色 / 成员数）
 * - 邀请码可复制（Taro.setClipboardData）
 * - 固定厨师展示；组织者可指定厨师（NutUI ActionSheet 选择成员 → teams.setChef）
 * - 成员列表（昵称 / 头像 / 角色徽章）
 * 对齐原生小程序 pages/team-detail。
 */
import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { ActionSheet, Empty, Skeleton } from '@nutui/nutui-react-taro'
import { teams, guestLogin } from '../../api'

const ROLE_LABELS: Record<string, string> = { organizer: '组织者', member: '成员' }

export default function TeamDetailPage() {
  const router = useRouter()
  const teamId = router.params.id as string

  const [team, setTeam] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)

  async function loadTeam() {
    if (!teamId) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    setLoading(true)
    try {
      await guestLogin().catch(() => null)
      const res: any = await teams.detail(teamId)
      setTeam(res.team || null)
      setMembers(
        (res.members || []).map((m: any) => ({
          id: m.id,
          nickname: m.nickname,
          avatar: m.avatar,
          role: m.role,
          role_label: ROLE_LABELS[m.role] || '成员'
        }))
      )
      setLoading(false)
      setRefreshing(false)
    } catch (e: any) {
      showToast({ title: e?.message || '加载失败', icon: 'none' })
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadTeam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId])

  function onCopyInvite() {
    const code = team && team.invite_code
    if (!code) return
    Taro.setClipboardData({
      data: code,
      success: () => {
        showToast({ title: '邀请码已复制，发给伙伴一起点菜吧', icon: 'none' })
      }
    })
  }

  function onAssignChef() {
    if (!team) return
    if (team.role !== 'organizer') {
      showToast({ title: '仅组织者可指定厨师', icon: 'none' })
      return
    }
    if (!members.length) {
      showToast({ title: '暂无成员可指定', icon: 'none' })
      return
    }
    setSheetVisible(true)
  }

  async function handleSelectChef(_item: any, index: number) {
    setSheetVisible(false)
    const target = members[index]
    if (!target) return
    try {
      await teams.setChef(team.id, target.id)
      showToast({ title: '已指定 ' + target.nickname + ' 为厨师', icon: 'none' })
      loadTeam()
    } catch (e: any) {
      showToast({ title: e?.message || '操作失败', icon: 'none' })
    }
  }

  return (
    <ScrollView
      scrollY
      refresherEnabled
      refresherTriggered={refreshing}
      onRefresherRefresh={() => { setRefreshing(true); loadTeam() }}
      style={{ height: '100vh', background: '#F5F5F5' }}
    >
      {loading ? (
        <View style={{ padding: 16 }}>
          <Skeleton rows={4} animated />
        </View>
      ) : !team ? (
        <View style={{ paddingTop: 40 }}>
          <Empty description="团队不存在或无权查看" status="shop" />
        </View>
      ) : (
        <View style={{ padding: 12 }}>
          {/* 团队信息 */}
          <View style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 }}>
            <View style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 12, background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                {team.icon || '🏠'}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text>{team.name}</Text>
                  <Text style={{ fontSize: 11, color: '#4CAF50', background: '#E8F5E9', padding: '1px 8px', borderRadius: 999 }}>
                    {team.role === 'organizer' ? '我是组织者' : '我是成员'}
                  </Text>
                </View>
                <View style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{team.member_count} 位成员</View>
              </View>
            </View>

            {/* 邀请码 */}
            <View style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid #eee' }}>
              <Text style={{ fontSize: 13, color: '#666' }}>邀请码</Text>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: 600, letterSpacing: 1, color: '#388E3C' }}>{team.invite_code || '—'}</Text>
              <Text onClick={onCopyInvite} style={{ padding: '3px 12px', background: '#E8F5E9', color: '#4CAF50', fontSize: 12, borderRadius: 999 }}>复制</Text>
            </View>

            {/* 固定厨师 */}
            <View style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid #eee' }}>
              <Text style={{ fontSize: 13, color: '#666' }}>固定厨师</Text>
              <Text style={{ flex: 1, fontSize: 13, color: team.chef ? '#1A1A1A' : '#FF9800' }}>
                {team.chef ? '👨‍🍳 ' + team.chef : '厨师待认领'}
              </Text>
              {team.role === 'organizer' && (
                <Text onClick={onAssignChef} style={{ fontSize: 12, color: '#999', flexShrink: 0 }}>指定厨师 ›</Text>
              )}
            </View>
          </View>

          {/* 成员列表 */}
          <View style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <View style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>成员列表（{members.length}）</View>
            {members.length === 0 ? (
              <Empty description="暂无成员" status="shop" />
            ) : (
              members.map((m) => (
                <View key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <View style={{ width: 36, height: 36, borderRadius: '50%', background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {m.avatar}
                  </View>
                  <View style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text>{m.nickname}</Text>
                    <Text style={{ fontSize: 11, color: '#999', background: '#F5F5F5', padding: '1px 8px', borderRadius: 999 }}>{m.role_label}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      )}

      {/* 指定厨师 ActionSheet */}
      <ActionSheet
        visible={sheetVisible}
        title="选择指定为厨师"
        cancelText="取消"
        options={members.map((m) => ({ name: m.nickname }))}
        optionKey={{ name: 'name' }}
        onSelect={(item, idx) => handleSelectChef(item, idx)}
        onCancel={() => setSheetVisible(false)}
      />
    </ScrollView>
  )
}
