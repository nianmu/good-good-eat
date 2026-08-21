/**
 * 全局轻量 Modal——好好吃饭
 * 替代原生 Taro.showModal，样式统一。
 */
import { useEffect, useState } from 'react'
import { View, Text } from '@tarojs/components'

interface ModalOpts {
  title?: string
  content: string
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
  onCancel?: () => void
}

let _showModal: (opts: ModalOpts) => void = () => {}

/** 全局 Modal 调用入口（替代 Taro.showModal） */
export function showModal(opts: ModalOpts) {
  _showModal(opts)
}

export default function AppModal() {
  const [visible, setVisible] = useState(false)
  const [opts, setOpts] = useState<ModalOpts>({ content: '' })

  useEffect(() => {
    _showModal = (o: ModalOpts) => {
      setOpts(o)
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const onConfirm = () => {
    setVisible(false)
    opts.onConfirm?.()
  }
  const onCancel = () => {
    setVisible(false)
    opts.onCancel?.()
  }

  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* 遮罩 */}
      <View onClick={onCancel} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)' }} />
      {/* 弹窗卡片 */}
      <View style={{
        position: 'relative', background: '#fff', borderRadius: '16px',
        width: '280px', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
      }}>
        {/* 内容区 */}
        <View style={{ padding: '24px 20px 16px', textAlign: 'center' }}>
          {opts.title && (
            <Text style={{ fontSize: '17px', fontWeight: 700, color: '#1A1A1A', display: 'block', marginBottom: '8px' }}>{opts.title}</Text>
          )}
          <Text style={{ fontSize: '14px', color: '#666', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{opts.content}</Text>
        </View>
        {/* 按钮区 */}
        <View style={{ display: 'flex', borderTop: '1px solid #f0f0f0' }}>
          <View onClick={onCancel}
            style={{ flex: 1, textAlign: 'center', padding: '14px 0', fontSize: '15px', color: '#999', cursor: 'pointer', borderRight: '1px solid #f0f0f0' }}>
            {opts.cancelText || '取消'}
          </View>
          <View onClick={onConfirm}
            style={{ flex: 1, textAlign: 'center', padding: '14px 0', fontSize: '15px', color: '#4CAF50', fontWeight: 600, cursor: 'pointer' }}>
            {opts.confirmText || '确定'}
          </View>
        </View>
      </View>
    </View>
  )
}
