import { View, Text } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { useState } from 'react'
import { Button, Empty, Skeleton } from '@nutui/nutui-react-taro'
import { messages as messagesApi } from '../../api'

//
// 消息中心（TabBar·消息）——对齐原生 miniprogram/pages/messages
// 分页列表 / 未读红点 / 点击已读 / 空态
//

const PAGE_SIZE = 15

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return `${p(d.getHours())}:${p(d.getMinutes())}`
  if (d.getFullYear() === today.getFullYear()) return `${p(d.getMonth() + 1)}-${p(d.getDate())}`
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function MessagesPage() {
  const [list, setList] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [unread, setUnread] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = (reset: boolean) => {
    const p = reset ? 1 : page + 1
    if (!reset) {
      if (loadingMore || !hasMore) return
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    messagesApi.list(p, PAGE_SIZE)
      .then((res: any) => {
        const items = (res.items || []).map((m: any) => ({
          id: m.id,
          title: m.title,
          content: m.content,
          is_read: !!m.is_read,
          time_text: formatTime(m.created_at)
        }))
        setList(reset ? items : (prev: any[]) => prev.concat(items))
        setTotal(res.total || 0)
        setUnread(res.unread_count != null ? res.unread_count : items.filter((i: any) => !i.is_read).length)
        setPage(p)
        setHasMore((res.items || []).length >= PAGE_SIZE)
      })
      .catch(() => Taro.showToast({ title: '消息加载失败', icon: 'none' }))
      .finally(() => { setLoading(false); setLoadingMore(false) })
  }

  useDidShow(() => load(true))
  useReachBottom(() => load(false))

  const markRead = (m: any) => {
    if (m.is_read) return
    messagesApi.read(m.id)
      .then(() => {
        setList((prev: any[]) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)))
        setUnread((u: number) => Math.max(0, u - 1))
      })
      .catch(() => Taro.showToast({ title: '操作失败', icon: 'none' }))
  }

  const goMenu = () => Taro.switchTab({ url: '/pages/menu/index' })

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)' }}>
      {total > 0 && (
        <View style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', fontSize: '13px', color: '#999', background: '#fff' }}>
          <Text>共 {total} 条</Text>
          {unread > 0 && <Text style={{ color: '#F44336' }}>{unread} 条未读</Text>}
        </View>
      )}

      {loading ? (
        <View style={{ padding: '16px' }}><Skeleton rows={5} animated /></View>
      ) : list.length > 0 ? (
        <View style={{ padding: '12px' }}>
          {list.map((m) => (
            <View key={m.id} onClick={() => markRead(m)} style={{
              background: m.is_read ? '#fff' : 'var(--color-primary-bg)',
              borderRadius: '10px', padding: '14px', marginBottom: '10px', position: 'relative', cursor: 'pointer'
            }}>
              {!m.is_read && <View style={{ position: 'absolute', top: '14px', left: '12px', width: '8px', height: '8px', borderRadius: '50%', background: '#F44336' }} />}
              <View style={{ paddingLeft: !m.is_read ? '12px' : '0' }}>
                <View style={{ fontSize: '15px', fontWeight: '600', color: m.is_read ? '#666' : '#1A1A1A' }}>{m.title}</View>
                {m.content ? <View style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{m.content}</View> : null}
                <View style={{ fontSize: '12px', color: '#bbb', marginTop: '6px' }}>{m.time_text}</View>
              </View>
            </View>
          ))}
          {loadingMore && <View style={{ textAlign: 'center', color: '#999', padding: '12px', fontSize: '13px' }}>加载更多…</View>}
          {!hasMore && list.length > 0 && <View style={{ textAlign: 'center', color: '#bbb', padding: '12px', fontSize: '12px' }}>— 没有更多了 —</View>}
        </View>
      ) : (
        <View style={{ paddingTop: '20vh', textAlign: 'center' }}>
          <Empty description="暂无消息" imageSize={120} />
          <Text style={{ display: 'block', fontSize: '12px', color: '#999', marginTop: '4px' }}>订单状态、团队动态会在此通知你</Text>
          <Button block type="primary" style={{ margin: '24px auto 0', width: '180px' }} onClick={goMenu}>去点菜</Button>
        </View>
      )}
    </View>
  )
}
