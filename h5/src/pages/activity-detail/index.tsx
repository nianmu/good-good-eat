/**
 * 活动详情页占位（Task 9 最小可跑版本）
 * 真正详情由 Task 10 完善；此处保证路由可达、参数可读、与 activities 列表联动
 */
import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useLoad, useDidShow } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { showToast } from '../../components/app-toast'
import { activities as activityApi } from '../../api'
import { formatTime } from '../../utils/format'

export default function ActivityDetailPage() {
  const [activity, setActivity] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const params: any = (Taro.getCurrentInstance().router as any)?.params || {}
    // Taro H5 有时 router.params 为空，兜底从 query 解析
    let id = params?.id
    if (!id && typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      id = sp.get('id') || ''
    }
    if (!id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res: any = await activityApi.detail(id)
      setActivity(res)
    } catch (e: any) {
      showToast({ title: e?.message || '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useLoad(() => load())
  useDidShow(() => load())

  if (loading) {
    return <View style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-placeholder)' }}>加载中…</View>
  }

  if (!activity) {
    return (
      <View style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-placeholder)' }}>
        <Text style={{ fontSize: 40 }}>🎉</Text>
        <View style={{ marginTop: 8 }}>活动不存在或已删除</View>
        <Button type="primary" size="small" style={{ marginTop: 16 }} onClick={() => Taro.switchTab({ url: '/pages/activities/index' })}>
          返回活动列表
        </Button>
      </View>
    )
  }

  const typeLabel = activity.type === 'party' ? '聚餐' : '日常'
  const statusLabelMap: Record<string, string> = {
    ordering: '点菜中',
    preparing: '备菜中',
    cooking: '烹饪中',
    completed: '已完成',
  }

  return (
    <View className="ggc-page" style={{ padding: 16, background: 'var(--color-bg-page)', minHeight: '100vh' }}>
      <View style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: 16 }}>
        <View style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{activity.name}</View>
        <View style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <View style={{ padding: '2px 8px', borderRadius: 999, background: '#E8F5E9', color: '#4CAF50', fontSize: 12 }}>{typeLabel}</View>
          <View style={{ padding: '2px 8px', borderRadius: 999, background: '#FFF3E0', color: '#FF9800', fontSize: 12 }}>
            {statusLabelMap[activity.status] || activity.status}
          </View>
        </View>
        <View style={{ fontSize: 12, color: 'var(--color-text-placeholder)', lineHeight: '20px' }}>
          <View>人数：{activity.people ?? '—'}</View>
          <View>备注：{activity.remark || '—'}</View>
          <View>创建时间：{formatTime(activity.created_at)}</View>
        </View>
      </View>

      <View style={{ background: 'var(--color-bg-card)', borderRadius: 12, padding: 16, marginTop: 12 }}>
        <View style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>占位说明</View>
        <View style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: '18px' }}>
          详情完整版（成员、菜品、进度、状态流转）由 Task 10 实现；当前保证列表点击可跳转、接口可通、WS 链路不报错。
        </View>
      </View>

      <View style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button fill="outline" size="small" style={{ flex: 1 }} onClick={() => Taro.navigateBack()}>
          返回
        </Button>
        <Button type="primary" size="small" style={{ flex: 1 }} onClick={() => Taro.switchTab({ url: '/pages/activities/index' })}>
          回活动列表
        </Button>
      </View>
    </View>
  )
}
