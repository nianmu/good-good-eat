import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState, useEffect } from 'react'
import { Button } from '@nutui/nutui-react-taro'
import { auth, teams as teamApi } from '../../api'
import { setToken } from '../../api/request'

/**
 * 欢迎页——好好吃饭
 * 首次进入（无 token）时展示，提供三种入口：
 *   1. 游客随便逛逛 → 自动游客登录 → 进菜谱
 *   2. 用户登录 → 跳转登录页
 *   3. 微信一键登录 → wx.login → /auth/wx-login（仅小程序端）
 *
 * 支持 invite_code 参数：来自好友分享链接，登录/注册后自动加入团队。
 */
export default function WelcomePage() {
  const router = useRouter()
  const inviteCode = router.params.invite_code || ''
  const [loading, setLoading] = useState<'guest' | 'wx' | ''>('')

  // 存储邀请码，登录后使用
  useEffect(() => {
    if (inviteCode) {
      Taro.setStorageSync('ggc_invite_code', inviteCode)
    }
  }, [inviteCode])

  const goHome = () => Taro.switchTab({ url: '/pages/menu/index' })
  const goLogin = () => {
    const qs = inviteCode ? `?invite_code=${inviteCode}` : ''
    Taro.navigateTo({ url: '/pages/auth/index?mode=login' + qs })
  }
  const goRegister = () => {
    const qs = inviteCode ? `?invite_code=${inviteCode}` : ''
    Taro.navigateTo({ url: '/pages/auth/index?mode=register' + qs })
  }

  // 游客登录
  const onGuest = async () => {
    if (loading) return
    setLoading('guest')
    try {
      await auth.guest()
      // 如果带有邀请码，游客登录后也尝试加入团队
      if (inviteCode) {
        await joinTeamByCode(inviteCode)
      }
      goHome()
    } catch {
      showToast({ title: '网络异常，请重试', icon: 'none' })
      setLoading('')
    }
  }

  // 微信小程序一键登录
  const onWxLogin = async () => {
    if (loading) return
    setLoading('wx')
    try {
      const { code } = await Taro.login()
      const res: any = await auth.wxLogin(code)
      if (res?.token) {
        setToken(res.token)
        Taro.setStorageSync('ggc_user', res.user)
      }
      // 登录后如果有邀请码，自动加入团队
      if (inviteCode) {
        await joinTeamByCode(inviteCode)
      }
      showToast({ title: '登录成功', icon: 'success' })
      setTimeout(goHome, 600)
    } catch (e: any) {
      showToast({ title: e?.message || '微信登录失败', icon: 'none' })
      setLoading('')
    }
  }

  // 通过邀请码加入团队
  const joinTeamByCode = async (code: string) => {
    try {
      const team: any = await teamApi.join(code)
      if (team?.name) {
        showToast({ title: '已加入「' + team.name + '」', icon: 'success' })
      }
    } catch {
      // 加入失败不阻断主流程（可能已在团队中）
    }
  }

  return (
    <View style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #E8F5E9 0%, #F5F5F5 50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 24px',
    }}>
      {/* 顶部品牌区 */}
      <View style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '20vh' }}>
        <View style={{
          width: '80px', height: '80px', borderRadius: '24px',
          background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '40px', boxShadow: '0 8px 24px rgba(76,175,80,0.35)',
          marginBottom: '20px',
        }}>
          🥬
        </View>
        <Text style={{ fontSize: '26px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '2px' }}>
          好好吃饭
        </Text>
        <Text style={{ fontSize: '14px', color: '#666', marginTop: '10px', letterSpacing: '1px' }}>
          只为好好吃饭，愿每一次下厨都成为幸福的开始
        </Text>
      </View>

      {/* 按钮区 */}
      <View style={{ width: '100%', maxWidth: '360px', paddingBottom: '60px' }}>
        {/* 微信一键登录 — 仅小程序端显示 */}
        {process.env.TARO_ENV === 'weapp' && (
          <Button
            type="primary"
            block
            loading={loading === 'wx'}
            style={{
              height: '48px', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
              background: '#07C160', borderColor: '#07C160', marginBottom: '14px',
            }}
            onClick={onWxLogin}
          >
            {loading === 'wx' ? '登录中…' : '💚 微信一键登录'}
          </Button>
        )}

        {/* 用户登录 */}
        <Button
          type="primary"
          block
          style={{
            height: '48px', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
            borderColor: '#4CAF50', marginBottom: '14px',
          }}
          onClick={goLogin}
        >
          用户登录
        </Button>

        {/* 游客逛逛 */}
        <Button
          block
          fill="outline"
          loading={loading === 'guest'}
          style={{
            height: '48px', borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            color: '#4CAF50', borderColor: '#4CAF50', marginBottom: '14px',
          }}
          onClick={onGuest}
        >
          {loading === 'guest' ? '进入中…' : '游客随便逛逛'}
        </Button>

        {/* 注册引导 */}
        <View style={{ textAlign: 'center', marginTop: '8px' }}>
          <Text style={{ fontSize: '13px', color: '#999' }}>
            还没有账号？
          </Text>
          <Text
            style={{ fontSize: '13px', color: '#4CAF50', fontWeight: 600, marginLeft: '4px' }}
            onClick={goRegister}
          >
            立即注册
          </Text>
        </View>
      </View>
    </View>
  )
}
