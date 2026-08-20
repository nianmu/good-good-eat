import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'

import '@nutui/nutui-react-taro/dist/style.css'
import './app.scss'
import { auth } from './api'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
    // 游客模式：启动时自动获取一个匿名身份，保证「无登录浏览与下单」。
    // 失败不阻塞应用（后端未就绪时静默降级）。
    if (!auth.token()) {
      auth.guest().catch(() => {})
    }
  })

  // children 是将要会渲染的页面
  return children
}
  


export default App
