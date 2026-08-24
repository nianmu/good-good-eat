import { View, Text } from '@tarojs/components'
import { useState } from 'react'
import Taro, { useLoad } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'

//
// 系统主题选择页——浅色 / 深色 / 跟随系统
//

type ThemeMode = 'light' | 'dark' | 'system'

const OPTIONS: { value: ThemeMode; label: string; icon: string; desc: string }[] = [
  { value: 'light', label: '浅色模式', icon: '☀️', desc: '默认经典白色主题' },
  { value: 'dark', label: '深色模式', icon: '🌙', desc: '夜间护眼，降低亮度' },
  { value: 'system', label: '跟随系统', icon: '📱', desc: '自动匹配手机系统设置' },
]

function applyTheme(mode: ThemeMode) {
  let resolved: 'light' | 'dark' = 'light'
  if (mode === 'dark') resolved = 'dark'
  else if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = resolved
  }
}

function persistTheme(mode: ThemeMode) {
  Taro.setStorageSync('ggc_theme', mode)
}

function getStoredTheme(): ThemeMode {
  try { return (Taro.getStorageSync('ggc_theme') as ThemeMode) || 'light' } catch { return 'light' }
}

export { applyTheme, getStoredTheme, persistTheme }

export default function ThemePage() {
  const [current, setCurrent] = useState<ThemeMode>('light')
  useLoad(() => { setCurrent(getStoredTheme()) })

  const select = (mode: ThemeMode) => {
    setCurrent(mode)
    persistTheme(mode)
    applyTheme(mode)
    showToast({ title: '主题已切换', icon: 'success' })
  }

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', padding: '16px 12px' }}>
      <Text style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-text-primary)', display: 'block', marginBottom: '12px' }}>选择主题</Text>
      {OPTIONS.map((o) => (
        <View
          key={o.value}
          onClick={() => select(o.value)}
          style={{
            background: 'var(--color-bg-card)', borderRadius: '12px', padding: '16px', marginBottom: '10px',
            display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer',
            border: current === o.value ? '2px solid #4CAF50' : '2px solid transparent',
          }}
        >
          <Text style={{ fontSize: '24px' }}>{o.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '15px', fontWeight: '600', color: 'var(--color-text-primary)' }}>{o.label}</Text>
            <Text style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-placeholder)', marginTop: '2px' }}>{o.desc}</Text>
          </View>
          {current === o.value && <Text style={{ color: '#4CAF50', fontSize: '18px', fontWeight: 'bold' }}>✓</Text>}
        </View>
      ))}
    </View>
  )
}
