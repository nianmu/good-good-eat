import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useEffect, useState } from 'react'
import { Button, Input } from '@nutui/nutui-react-taro'
import { auth, teams as teamApi } from '../../api'
import { setToken } from '../../api/request'

/**
 * 登录 / 注册页——好好吃饭
 * 路由参数 mode=login|register 控制初始 tab。
 * 注册成功后自动登录并跳转首页，无需再手动登录。
 * 若当前是游客会话（携带 token），注册请求会自动绑定并升级账号。
 */
export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const m = router.params?.mode
    if (m === 'register' || m === 'login') setMode(m)
  }, [router.params])

  const goHome = () => Taro.switchTab({ url: '/pages/menu/index' })

  const submit = async () => {
    if (loading) return
    const u = username.trim()
    if (!u || !password) {
      setError('请填写用户名和密码')
      return
    }
    if (mode === 'register' && password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setError('')
    setLoading(true)
    try {
      let res: any
      if (mode === 'login') {
        res = await auth.login(u, password)
      } else {
        res = await auth.register(u, password, nickname || undefined)
      }
      // 确保 token 和用户信息写入本地
      if (res?.token) setToken(res.token)
      if (res?.user) Taro.setStorageSync('ggc_user', res.user)
      showToast({ title: mode === 'login' ? '登录成功' : '注册成功', icon: 'success' })
      // 登录/注册成功后，如果有邀请码，自动加入团队
      const savedCode = router.params?.invite_code || Taro.getStorageSync('ggc_invite_code') || ''
      if (savedCode) {
        try {
          const team: any = await teamApi.join(savedCode)
          if (team?.name) {
            showToast({ title: '已加入「' + team.name + '」', icon: 'success' })
          }
          Taro.removeStorageSync('ggc_invite_code')
        } catch {
          // 加入失败不阻断主流程
        }
      }
      setTimeout(goHome, 600)
    } catch (e: any) {
      setError(e?.message || '操作失败')
      setLoading(false)
    }
  }

  const toggle = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
  }

  return (
    <View style={{ minHeight: '100vh', background: '#F5F5F5' }}>
      {/* 顶部品牌头图 */}
      <View style={{
        background: 'linear-gradient(160deg, #4CAF50, #388E3C)',
        padding: '48px 24px 36px',
        borderRadius: '0 0 28px 28px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 装饰圆 */}
        <View style={{
          position: 'absolute', top: '-30px', right: '-20px',
          width: '120px', height: '120px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)',
        }} />
        <View style={{
          position: 'absolute', bottom: '-10px', left: '30px',
          width: '60px', height: '60px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
        }} />

        <View style={{ fontSize: '28px', marginBottom: '8px' }}>🥬</View>
        <Text style={{ fontSize: '24px', fontWeight: 800, color: '#fff', display: 'block' }}>
          {mode === 'login' ? '欢迎回来' : '注册账号'}
        </Text>
        <Text style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', marginTop: '6px', display: 'block' }}>
          {mode === 'login' ? '登录后同步团队、订单和菜谱' : '创建账号，开启你的美食之旅'}
        </Text>
      </View>

      {/* 表单卡片 */}
      <View style={{
        background: '#fff', margin: '-16px 16px 0', borderRadius: '16px',
        padding: '24px 20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        position: 'relative', zIndex: 1,
      }}>
        {/* Tab 切换 */}
        <View style={{
          display: 'flex', background: '#F5F5F5', borderRadius: '10px',
          padding: '3px', marginBottom: '24px',
        }}>
          {(['login', 'register'] as const).map((m) => (
            <View
              key={m}
              onClick={() => toggle(m)}
              style={{
                flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: '8px',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s',
                background: mode === m ? '#fff' : 'transparent',
                color: mode === m ? '#4CAF50' : '#999',
                boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {m === 'login' ? '登录' : '注册'}
            </View>
          ))}
        </View>

        {/* 用户名 */}
        <View style={{ marginBottom: '16px' }}>
          <Text style={{ fontSize: '13px', color: '#666', marginBottom: '8px', display: 'block' }}>用户名</Text>
          <View style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            height: '44px', background: '#F8F9FA', borderRadius: '10px', padding: '0 14px',
            border: '1px solid #E8E8E8',
          }}>
            <Text style={{ fontSize: '16px', flexShrink: 0 }}>👤</Text>
            <Input
              type="text"
              placeholder="字母/数字/下划线，3-32 位"
              value={username}
              onChange={(v) => { setUsername(String(v || '').trim()); setError('') }}
              style={{ flex: 1, height: '44px', background: 'transparent', border: 'none' }}
            />
          </View>
        </View>

        {/* 昵称（仅注册） */}
        {mode === 'register' && (
          <View style={{ marginBottom: '16px' }}>
            <Text style={{ fontSize: '13px', color: '#666', marginBottom: '8px', display: 'block' }}>
              昵称 <Text style={{ color: '#bbb', fontSize: '12px' }}>(选填，展示给家人)</Text>
            </Text>
            <View style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              height: '44px', background: '#F8F9FA', borderRadius: '10px', padding: '0 14px',
              border: '1px solid #E8E8E8',
            }}>
              <Text style={{ fontSize: '16px', flexShrink: 0 }}>✏️</Text>
              <Input
                type="text"
                placeholder="你的昵称"
                value={nickname}
                onChange={(v) => setNickname(String(v || ''))}
                style={{ flex: 1, height: '44px', background: 'transparent', border: 'none' }}
              />
            </View>
          </View>
        )}

        {/* 密码 */}
        <View style={{ marginBottom: '16px' }}>
          <Text style={{ fontSize: '13px', color: '#666', marginBottom: '8px', display: 'block' }}>密码</Text>
          <View style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            height: '44px', background: '#F8F9FA', borderRadius: '10px', padding: '0 14px',
            border: '1px solid #E8E8E8',
          }}>
            <Text style={{ fontSize: '16px', flexShrink: 0 }}>🔒</Text>
            <Input
              type="password"
              placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
              value={password}
              onChange={(v) => { setPassword(String(v || '')); setError('') }}
              style={{ flex: 1, height: '44px', background: 'transparent', border: 'none' }}
            />
          </View>
        </View>

        {/* 错误提示 */}
        {error && (
          <View style={{
            background: '#FFF3E0', borderRadius: '8px', padding: '10px 14px',
            marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <Text style={{ fontSize: '14px' }}>⚠️</Text>
            <Text style={{ color: '#E65100', fontSize: '13px' }}>{error}</Text>
          </View>
        )}

        {/* 提交按钮 */}
        <Button
          type="primary"
          block
          loading={loading}
          onClick={submit}
          style={{
            height: '48px', borderRadius: '12px', fontSize: '16px', fontWeight: 700,
            background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
            borderColor: '#4CAF50',
          }}
        >
          {loading ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </Button>

        {/* 游客入口 */}
        <View style={{ textAlign: 'center', marginTop: '16px' }}>
          <Text
            style={{ fontSize: '13px', color: '#999' }}
            onClick={() => Taro.navigateBack().catch(() => Taro.switchTab({ url: '/pages/menu/index' }))}
          >
            暂不登录，游客模式逛逛 ›
          </Text>
        </View>
      </View>

      {/* 底部提示 */}
      <View style={{ padding: '28px 24px', textAlign: 'center' }}>
        <Text style={{ fontSize: '11px', color: '#bbb', lineHeight: '1.8' }}>
          登录后自动绑定当前游客数据{'\n'}订单和菜谱不会丢失
        </Text>
      </View>
    </View>
  )
}
