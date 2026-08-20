import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { Button, Dialog, Empty, Skeleton } from '@nutui/nutui-react-taro'
import { plans } from '../../api'
import store from '../../store'

//
// 饮食计划详情页——对齐原生 miniprogram/pages/plan-detail
// 菜品清单合计 / 一键加购 / 删除
//

export default function PlanDetailPage() {
  const [id, setId] = useState<any>(null)
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [delVisible, setDelVisible] = useState(false)

  useLoad((p) => {
    const pid = p && p.id
    setId(pid)
    plans.detail(pid).then((r: any) => {
      setPlan(r)
      Taro.setNavigationBarTitle({ title: r.name || '计划详情' })
    }).catch(() => Taro.showToast({ title: '加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  })

  const addText = () => {
    if (!plan) return ''
    return (plan.items || []).map((it: any) => {
      if (!it.dish) return ''
      return it.quantity > 1 ? `${it.dish.name}×${it.quantity}` : it.dish.name
    }).filter(Boolean).join('、')
  }

  const onAddAll = () => {
    const dishes = (plan.items || []).map((it: any) => it.dish).filter(Boolean)
    if (!dishes.length) { Taro.showToast({ title: '暂无菜品', icon: 'none' }); return }
    const cart: Record<string, number> = { ...(store.get('cart') || {}) }
    ;(plan.items || []).forEach((it: any) => {
      if (it.dish) cart[String(it.dish.id)] = (cart[String(it.dish.id)] || 0) + it.quantity
    })
    store.set('cart', cart)
    Taro.showToast({ title: '已加入购物车：' + addText(), icon: 'none' })
  }

  const onDelete = () => {
    plans.remove(id).then(() => {
      Taro.showToast({ title: '已删除', icon: 'success' })
      setDelVisible(false)
      setTimeout(() => Taro.navigateBack(), 600)
    }).catch(() => Taro.showToast({ title: '删除失败', icon: 'none' }))
  }

  if (loading) {
    return <View style={{ padding: '16px' }}><Skeleton rows={6} animated /></View>
  }
  if (!plan) {
    return <View style={{ paddingTop: '20vh', textAlign: 'center' }}><Empty description="计划不存在或已删除" imageSize={120} /></View>
  }

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '80px' }}>
      <View style={{ background: '#fff', padding: '18px 16px', marginBottom: '12px' }}>
        <Text style={{ fontSize: '20px', fontWeight: 'bold' }}>{plan.name}</Text>
        {plan.total_count != null && <Text style={{ display: 'block', fontSize: '13px', color: '#888', marginTop: '4px' }}>共 {plan.total_count} 份菜品</Text>}
        {plan.note && <Text style={{ display: 'block', fontSize: '13px', color: '#999', marginTop: '6px' }}>{plan.note}</Text>}
      </View>

      <View style={{ background: '#fff', padding: '14px 16px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>菜品清单</Text>
        {(plan.items || []).map((it: any, i: number) => (
          <View key={it.dish ? String(it.dish.id) : i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-divider)' }}>
            {it.dish ? (
              <View style={{ width: '42px', height: '42px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', background: it.dish.color || '#E8F5E9' }}>{it.dish.emoji}</View>
            ) : <View style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>🍽</View>}
            <View style={{ flex: 1, marginLeft: '10px' }}>
              <View style={{ fontSize: '15px' }}>{it.dish ? it.dish.name : '菜品已下架'}</View>
              {it.dish && <View style={{ fontSize: '12px', color: '#F44336' }}>¥{it.dish.price}</View>}
            </View>
            <Text style={{ fontSize: '14px', color: '#666' }}>×{it.quantity}</Text>
          </View>
        ))}
      </View>

      {/* 底部操作栏 */}
      <View style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', display: 'flex', gap: '12px', padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
        <Button plain type="danger" style={{ flex: 1 }} onClick={() => setDelVisible(true)}>删除</Button>
        <Button type="primary" style={{ flex: 2 }} onClick={onAddAll}>一键加入购物车</Button>
      </View>

      <Dialog
        visible={delVisible}
        title="删除计划"
        content={`确定要删除「${plan.name || ''}」吗？`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={onDelete}
        onCancel={() => setDelVisible(false)}
        onClose={() => setDelVisible(false)}
      />
    </View>
  )
}
