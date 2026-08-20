import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import Taro from '@tarojs/taro'

import '@nutui/nutui-react-taro/dist/style.css'
import './app.scss'
import { auth } from './api'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
    // 已有 token 且非 welcome 页 → 刷新用户信息（静默，失败不阻塞）
    // 无 token → 保持在 welcome 页，由用户主动选择登录方式
    if (auth.token()) {
      auth.me().then((res: any) => {
        if (res?.user) Taro.setStorageSync('ggc_user', res.user)
      }).catch(() => {})
    }
  })

  // children 是将要会渲染的页面
  return children
}

export default App
