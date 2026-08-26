import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import '@nutui/nutui-react-taro/dist/style.css'
import './app.scss'
import { auth } from './api'
import AppToast from './components/app-toast'
import AppModal from './components/app-modal'

/** 应用已保存的主题偏好（H5 端通过 data-theme 属性生效） */
function initTheme() {
  try {
    const mode: string = Taro.getStorageSync('ggc_theme') || 'light'
    let resolved: 'light' | 'dark' = 'light'
    if (mode === 'dark') resolved = 'dark'
    else if (mode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.theme = resolved
    }
  } catch { /* 忽略 */ }
}

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    initTheme()
    if (auth.token()) {
      auth.me().then((res: any) => {
        if (res?.user) Taro.setStorageSync('ggc_user', res.user)
      }).catch(() => {})
    }
  })

  return <View>
    {children}
    <AppToast />
    <AppModal />
  </View>
}

export default App
