/**
 * 全局轻量 Toast——好好吃饭
 * 替代原生 Taro.showToast，样式统一、可控制显隐。
 */
import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

let _show: (opts: { title: string; icon?: string; duration?: number }) => void = () => {}

/** 全局 Toast 调用入口（替代 Taro.showToast） */
export function showToast(opts: { title: string; icon?: string; duration?: number }) {
  _show(opts)
}

const ICON_MAP: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  none: '',
  loading: '⏳',
}

export default function AppToast() {
  const [visible, setVisible] = useState(false)
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState('')
  const [opacity, setOpacity] = useState(0)

  useEffect(() => {
    let timer: any
    _show = (opts) => {
      setTitle(opts.title)
      setIcon(ICON_MAP[opts.icon || 'none'] || '')
      setVisible(true)
      setOpacity(1)
      clearTimeout(timer)
      timer = setTimeout(() => {
        setOpacity(0)
        setTimeout(() => setVisible(false), 300)
      }, opts.duration || 2000)
    }
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <View style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)', zIndex: 9999,
      background: 'rgba(0,0,0,0.75)', borderRadius: '12px',
      padding: '14px 24px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '6px', transition: 'opacity 0.3s',
      opacity, pointerEvents: 'none',
    }}>
      {icon ? <Text style={{ fontSize: '28px' }}>{icon}</Text> : null}
      <Text style={{ color: '#fff', fontSize: '14px', textAlign: 'center', maxWidth: '200px', lineHeight: '1.4' }}>{title}</Text>
    </View>
  )
}
