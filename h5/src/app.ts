import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import Taro from '@tarojs/taro'

import '@nutui/nutui-react-taro/dist/style.css'
import './app.scss'
import { auth } from './api'
import AppToast from './components/app-toast'
import AppModal from './components/app-modal'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('App launched.')
    if (auth.token()) {
      auth.me().then((res: any) => {
        if (res?.user) Taro.setStorageSync('ggc_user', res.user)
      }).catch(() => {})
    }
  })

  return <>
    {children}
    <AppToast />
    <AppModal />
  </>
}

export default App
