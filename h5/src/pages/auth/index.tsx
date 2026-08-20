import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { Button, Input } from '@nutui/nutui-react-taro'
import { auth } from '../../api'

// H5 独立账号：登录 / 注册（后端 /auth/login · /auth/register）
// 注册时若当前是游客（本地已 auto guest），请求会自动携带游客 token → 静默升级账号。
export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const goProfile = () => Taro.switchTab({ url: '/pages/profile/index' })

  const submit = async () => {
    if (loading) return
    const u = username.trim()
    if (!u || !password) {
      setError('请填写用户名和密码')
      return
    }
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await auth.login(u, password)
      } else {
        await auth.register(u, password, nickname)
      }
      Taro.showToast({ title: mode === 'login' ? '登录成功' : '注册成功', icon: 'success' })
      setTimeout(goProfile, 600)
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
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)' }}>
      <View style={{ background: 'linear-gradient(160deg,#4CAF50,#388E3C)', padding: '40px 20px 28px', color: '#fff' }}>
        <View style={{ fontSize: '22px', fontWeight: 700 }}>好好吃饭</View>
        <View style={{ fontSize: '13px', opacity: 0.85, marginTop: '6px' }}>登录后跨设备同步团队 / 订单 / 菜谱</View>
      </View>

      <View style={{ background: '#fff', margin: '20px', borderRadius: '12px', padding: '18px 20px' }}>
        <View style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
          {(['login', 'register'] as const).map((m) => (
            <Button key={m} size="small"
              type={mode === m ? 'primary' : 'default'}
              fill={mode === m ? 'solid' : 'outline'}
              plain={mode !== m}
              onClick={() => toggle(m)}>
              {m === 'login' ? '登录' : '注册'}
            </Button>
          ))}
        </View>

        <View style={{ marginBottom: '12px' }}>
          <Text style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>用户名</Text>
          <Input
            type="text"
            placeholder="字母/数字/下划线，3-32 位"
            value={username}
            onChange={(v) => setUsername(String(v || '').trim())}
          />
        </View>

        {mode === 'register' && (
          <View style={{ marginBottom: '12px' }}>
            <Text style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>昵称（可选）</Text>
            <Input type="text" placeholder="展示给家人的昵称" value={nickname} onChange={(v) => setNickname(String(v || ''))} />
          </View>
        )}

        <View style={{ marginBottom: '12px' }}>
          <Text style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>密码</Text>
          <Input
            type="password"
            placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
            value={password}
            onChange={(v) => setPassword(String(v || ''))}
          />
        </View>

        {error && <View style={{ color: '#F44336', fontSize: '12px', marginTop: '4px' }}>{error}</View>}

        <Button type="primary" block loading={loading} onClick={submit} style={{ marginTop: '16px' }}>
          {loading ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </Button>

        <Button fill="none" style={{ marginTop: '10px', color: '#666' }} onClick={goProfile}>暂不登录，先逛逛 ›</Button>
      </View>

      <View style={{ padding: '20px', textAlign: 'center' }}>
        <Text style={{ fontSize: '11px', color: '#999' }}>游客也能下单；注册/登录后自动绑定当前账号，订单菜谱不丢失。</Text>
      </View>
    </View>
  )
}