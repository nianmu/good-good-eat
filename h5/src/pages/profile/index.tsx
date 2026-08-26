import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useLoad } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Empty, Tag, Dialog, Input } from '@nutui/nutui-react-taro'
import { auth } from '../../api'

//
// 我的页面（TabBar·我的）——对齐原生 miniprogram/pages/profile
// 绿色头部 / 统计三格 / 我的团队卡片 / 功能宫格
//

const TEAM_ICONS = ['🏠', '🍽', '🎓']
const ROLE_LABELS: Record<string, string> = { organizer: '组织者', member: '成员' }

const FEATURES = [
  { id: 'kitchen', name: '厨房管理', icon: '🍳', color: '#FF9800', url: '/pages/recipe-list/index' },
  { id: 'fridge', name: '厨房冰箱', icon: '🧊', color: '#2196F3', url: '/pages/fridge/index' },
  { id: 'basket', name: '厨房菜篮', icon: '🛒', color: '#4CAF50', url: '/pages/basket/index' },
  { id: 'favorite', name: '我的收藏', icon: '❤️', color: '#E91E63', url: '/pages/favorites/index' },
  { id: 'diet', name: '饮食计划', icon: '📅', color: '#9C27B0', url: '/pages/plans/index' },
  { id: 'tutorial', name: '使用指南', icon: '📖', color: '#607D8B', url: '/pages/guide/index' },
  { id: 'theme', name: '系统主题', icon: '🎨', color: '#FF5722', url: '/pages/theme/index' }
]

export default function ProfilePage() {
    const [user, setUser] = useState<any>({ avatar: '👤', nickname: '好好吃饭', code: '', isGuest: true })
  const [stats, setStats] = useState<any>({ totalOrders: 0, totalDishes: 0, favoriteDishes: 0 })
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editNicknameVisible, setEditNicknameVisible] = useState(false)
  const [editNicknameValue, setEditNicknameValue] = useState('')
  const [editNicknameLoading, setEditNicknameLoading] = useState(false)

  const applyUser = (u: any) => {
    const teamList = (u.teams || []).map((t: any, idx: number) => ({
      id: t.id,
      name: t.name,
      icon: t.icon || TEAM_ICONS[idx % TEAM_ICONS.length],
      role_label: ROLE_LABELS[t.role] || '成员',
      member_count: t.member_count || 0,
      chef: t.chef || null
    }))
    const raw = u.stats || {}
    const s = {
      totalActivities: raw.total_activities != null ? raw.total_activities : (raw.totalActivities || 0),
      totalDishes: raw.total_dishes != null ? raw.total_dishes : (raw.totalDishes || 0),
      favoriteDishes: raw.favorite_dishes != null ? raw.favorite_dishes : (raw.favoriteDishes || 0)
    }
                  setUser({
      avatar: u.avatar || '👤',
      nickname: u.nickname || '好好吃饭',
      code: u.code || u.user_code || '',
      isGuest: u.is_guest === 1 || u.is_guest === true
    })
    setStats(s)
    setTeams(teamList)
  }

  const loadMe = () => {
    auth.me()
      .then((res: any) => applyUser(res.user || res))
      .catch(() => {
        showToast({ title: '加载失败', icon: 'none' })
      })
      .finally(() => setLoading(false))
  }

  useLoad(() => loadMe())
  useDidShow(() => loadMe())

  const goTeam = (id: any) => Taro.navigateTo({ url: `/pages/team-detail/index?id=${id}` })
  const goManageTeams = () => Taro.navigateTo({ url: '/pages/team-list/index' })

  // 昵称编辑
  const openEditNickname = () => {
    setEditNicknameValue(user.nickname || '')
    setEditNicknameVisible(true)
  }
  const onSaveNickname = async () => {
    const name = editNicknameValue.trim()
    if (!name) {
      showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    if (editNicknameLoading) return
    setEditNicknameLoading(true)
    try {
      const res: any = await auth.updateProfile({ nickname: name })
      if (res?.user) {
        Taro.setStorageSync('ggc_user', res.user)
        applyUser(res.user)
      }
      setEditNicknameVisible(false)
      showToast({ title: '修改成功', icon: 'success' })
    } catch (e: any) {
      showToast({ title: e?.message || '修改失败', icon: 'none' })
    } finally {
      setEditNicknameLoading(false)
    }
  }

  const onFeature = (f: any) => {
    if (f.url) Taro.navigateTo({ url: f.url })
  }

  return (
    <View className="ggc-page ggc-tabbar-page" style={{ minHeight: '100vh', background: 'var(--color-bg-page)' }}>
      {/* 顶部绿色主题区 */}
      <View style={{ background: 'linear-gradient(160deg,#4CAF50,#388E3C)', padding: '32px 20px 20px', color: '#fff' }}>
        <View style={{ fontSize: '13px', opacity: 0.85 }}>只为好好吃饭</View>
        <View style={{ display: 'flex', alignItems: 'center', marginTop: '14px' }}>
          <View style={{
            width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px'
          }}>{user.avatar}</View>
          <View style={{ marginLeft: '14px', flex: 1 }}>
            <View style={{ fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {user.nickname}
              {!user.isGuest && (
                <Text
                  style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
                  onClick={openEditNickname}
                >✏️</Text>
              )}
            </View>
            <View style={{ fontSize: '13px', opacity: 0.85, marginTop: '4px' }}>
              标识码 {user.code || '—'} · {user.isGuest ? <Text style={{ color: '#FFEB3B' }}>游客</Text> : '已登录'}
            </View>
          </View>
          <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!user.isGuest && (
              <Button size="small" fill="outline"
                onClick={() => { auth.logout(); Taro.navigateTo({ url: '/pages/auth/index' }) }}
                style={{ color: '#fff', height: '28px' }}>退出</Button>
            )}
            {user.isGuest && (
              <Button size="small" type="primary" plain fill="solid"
                onClick={() => Taro.navigateTo({ url: '/pages/auth/index' })}
                style={{ color: '#fff', height: '28px' }}>登录/升级</Button>
            )}
          </View>
        </View>
        {/* 统计三格 */}
        <View style={{ display: 'flex', alignItems: 'center', marginTop: '22px', background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '14px 0' }}>
          {[
            { num: stats.totalActivities ?? 0, label: '总饭局' },
            { num: stats.totalDishes, label: '点过的菜' },
            { num: stats.favoriteDishes, label: '收藏', onClick: () => Taro.navigateTo({ url: '/pages/favorites/index' }) }
          ].map((item, i) => (
            <View key={i} style={{ flex: 1, textAlign: 'center', ...(item.onClick ? { cursor: 'pointer' } : {}) }} onClick={item.onClick}>
              <View style={{ fontSize: '22px', fontWeight: 'bold' }}>{item.num}</View>
              <View style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>{item.label}</View>
            </View>
          ))}
        </View>
      </View>

      {/* 我的团队 */}
      <View style={{ background: 'var(--color-bg-card)', margin: '12px', borderRadius: '12px', padding: '14px 16px' }}>
        <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <Text style={{ fontSize: '16px', fontWeight: 'bold' }}>我的团队</Text>
          <Text style={{ fontSize: '13px', color: 'var(--color-text-placeholder)', cursor: 'pointer' }} onClick={goManageTeams}>管理 ›</Text>
        </View>
        {loading ? null : teams.length > 0 ? (
          teams.map((t) => (
            <View key={t.id} onClick={() => goTeam(t.id)}
              style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-divider)', cursor: 'pointer' }}>
              <View style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>{t.icon}</View>
              <View style={{ flex: 1, marginLeft: '12px' }}>
                <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Text style={{ fontSize: '15px', fontWeight: '600' }}>{t.name}</Text>
                  <Tag type="primary" plain>{t.role_label}</Tag>
                </View>
                <View style={{ fontSize: '12px', color: 'var(--color-text-placeholder)', marginTop: '3px' }}>
                  {t.member_count} 位成员 · {t.chef ? `厨师：${t.chef}` : <Text style={{ color: '#FF9800' }}>厨师待认领</Text>}
                </View>
              </View>
              <Text style={{ color: '#ccc' }}>›</Text>
            </View>
          ))
        ) : (
          <View style={{ paddingTop: '4px' }}>
            <Empty description="还没有加入团队，去创建一个吧" imageSize={90} />
            <Button block plain type="primary" onClick={goManageTeams} style={{ marginTop: '8px' }}>去创建/加入</Button>
          </View>
        )}
      </View>

      {/* 功能宫格 */}
      <View style={{ background: 'var(--color-bg-card)', margin: '12px', borderRadius: '12px', padding: '14px 16px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold' }}>我的厨房</Text>
        <View style={{ display: 'flex', flexWrap: 'wrap', marginTop: '14px' }}>
          {FEATURES.map((f) => (
            <View key={f.id} onClick={() => onFeature(f)}
              style={{ width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '18px', cursor: 'pointer' }}>
              <View style={{
                width: '46px', height: '46px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
                background: f.color + '1F', color: f.color
              }}>{f.icon}</View>
              <Text style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>{f.name}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 昵称编辑弹窗 */}
      <Dialog
        title="修改昵称"
        visible={editNicknameVisible}
        onConfirm={onSaveNickname}
        onCancel={() => setEditNicknameVisible(false)}
        confirmText={editNicknameLoading ? '保存中…' : '保存'}
        cancelText="取消"
      >
        <View style={{ padding: '8px 0' }}>
          <Input
            type="text"
            placeholder="输入新昵称"
            value={editNicknameValue}
            onChange={(v) => setEditNicknameValue(String(v || ''))}
            maxLength={64}
            style={{ background: '#F8F9FA', borderRadius: '8px', padding: '0 12px' }}
          />
        </View>
      </Dialog>

      {/* 底部声明 */}
      <View style={{ padding: '20px 20px 40px', textAlign: 'center' }}>
        <Text style={{ fontSize: '11px', color: 'var(--color-text-placeholder)' }}>本平台面向家庭、情侣等用户，是美食记录与烹饪协作工具，不涉及交易与支付。</Text>
        <Text style={{ display: 'block', fontSize: '11px', color: '#d7a626', marginTop: '6px' }}>⚠ 如需转账，请自行核实对方身份，切勿轻信网络陌生人。</Text>
      </View>
    </View>
  )
}
