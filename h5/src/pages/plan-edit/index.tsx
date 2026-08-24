import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad, useRouter } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Input } from '@nutui/nutui-react-taro'
import { categories, dishes, plans } from '../../api'

//
// 新建饮食计划页——对齐原生 miniprogram/pages/plan-edit
// 名称/备注 + 已选清单（数量可调可移除）+ 推荐组合预填 + 手动分类选菜
//

export default function PlanEditPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<any[]>([]) // { dish, quantity }
  const [groups, setGroups] = useState<any[]>([])
  const [activeCatId, setActiveCatId] = useState('')
  const [recommendReason, setRecommendReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useLoad((p) => {
    Promise.all([categories.list(), dishes.list({ page_size: 100 })])
      .then((res: any[]) => {
        const cats = res[0] || []
        const all = (res[1] && res[1].items) || []
        const g = cats.map((c: any) => ({ id: c.id, name: c.name, dishes: all.filter((d: any) => String(d.category_id) === String(c.id)) }))
        setGroups(g)
        setActiveCatId(cats.length ? cats[0].id : '')
        setLoaded(true)
      })
      .catch(() => showToast({ title: '加载失败', icon: 'none' }))

    const params = p || router.params || {}
    if (params.from === 'recommend') {
      const people = parseInt(params.people, 10) || 3
      dishes.recommend(people).then((res: any) => {
        const plan = res.plan || []
        setItems(plan.map((d: any) => ({ dish: d, quantity: 1 })))
        setRecommendReason(res.reason || '')
        if (plan.length) setName((n) => n || `今天吃什么（${people}人）`)
      }).catch(() => showToast({ title: '推荐加载失败', icon: 'none' }))
    }
  })

  const activeGroup = groups.find((g) => String(g.id) === String(activeCatId))

  const pickDish = (dish: any) => {
    setItems((prev: any[]) => {
      const idx = prev.findIndex((it) => String(it.dish.id) === String(dish.id))
      if (idx >= 0) {
        const next = prev.slice()
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
        return next
      }
      return prev.concat([{ dish, quantity: 1 }])
    })
  }

  const inc = (idx: number) => setItems((prev: any[]) => prev.map((it, i) => (i === idx ? { ...it, quantity: it.quantity + 1 } : it)))
  const dec = (idx: number) => setItems((prev: any[]) => {
    const it = prev[idx]
    if (it.quantity <= 1) return prev.filter((_, i) => i !== idx)
    return prev.map((x, i) => (i === idx ? { ...x, quantity: x.quantity - 1 } : x))
  })

  const onSave = () => {
    if (!name.trim()) { showToast({ title: '请填写计划名称', icon: 'none' }); return }
    if (!items.length) { showToast({ title: '请至少选择一道菜', icon: 'none' }); return }
    if (saving) return
    setSaving(true)
    plans.create({
      name: name.trim(),
      note: note || '',
      items: items.map((it) => ({ dish_id: it.dish.id, quantity: it.quantity }))
    }).then(() => {
      showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    }).catch(() => { showToast({ title: '保存失败', icon: 'none' }); setSaving(false) })
  }

  const label = { display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '14px 0 8px' } as const

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '80px' }}>
      {/* 基本信息 */}
      <View style={{ background: 'var(--color-bg-card)', padding: '4px 16px 12px', marginBottom: '12px' }}>
        <Text style={label}>名称</Text>
        <View style={{ width: '100%' }}>
          <Input value={name} placeholder="如：一周家庭菜谱" onChange={(v) => setName(String(v || ''))} style={{ background: 'var(--color-bg-page)', borderRadius: '8px', padding: '0 12px', height: '44px', fontSize: '15px' }} />
        </View>
        <Text style={label}>备注</Text>
        <View style={{ width: '100%' }}>
          <Input value={note} placeholder="可选，如：荤素搭配" onChange={(v) => setNote(String(v || ''))} style={{ background: 'var(--color-bg-page)', borderRadius: '8px', padding: '0 12px', height: '44px', fontSize: '15px' }} />
        </View>
        {recommendReason && <View style={{ fontSize: '13px', color: '#FF9800', marginTop: '10px' }}>🤔 {recommendReason}</View>}
      </View>

      {/* 已选清单 */}
      {items.length > 0 && (
        <View style={{ background: 'var(--color-bg-card)', padding: '14px 16px', marginBottom: '12px' }}>
          <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>已选菜品（{items.length}）</Text>
          {items.map((it, idx) => (
            <View key={String(it.dish.id)} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-divider)' }}>
              <View style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', background: it.dish.color || '#E8F5E9' }}>{it.dish.emoji}</View>
              <View style={{ flex: 1, marginLeft: '10px' }}>
                <View style={{ fontSize: '15px', fontWeight: 600 }}>{it.dish.name}</View>
                <View style={{ fontSize: '12px', color: '#F44336' }}>¥{it.dish.price}</View>
              </View>
              <View style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <View onClick={() => dec(idx)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>−</View>
                <Text style={{ fontSize: '15px', fontWeight: '600' }}>{it.quantity}</Text>
                <View onClick={() => inc(idx)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#4CAF50', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>＋</View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 手动选择 */}
      <View style={{ background: 'var(--color-bg-card)', padding: '14px 0 16px' }}>
        <Text style={{ ...label, marginLeft: '16px' }}>添加菜品</Text>
        <ScrollView scrollX style={{ whiteSpace: 'nowrap', padding: '0 16px' }}>
          <View style={{ display: 'inline-flex', gap: '8px' }}>
            {groups.map((g) => (
              <View key={g.id} onClick={() => setActiveCatId(g.id)} style={{
                padding: '6px 14px', borderRadius: '16px', fontSize: '13px',
                background: String(g.id) === String(activeCatId) ? '#4CAF50' : '#f0f0f0',
                color: String(g.id) === String(activeCatId) ? '#fff' : '#555', cursor: 'pointer'
              }}>{g.name}</View>
            ))}
          </View>
        </ScrollView>

        <View style={{ marginTop: '12px', padding: '0 16px' }}>
          {activeGroup ? (activeGroup.dishes || []).map((dish: any) => (
            <View key={dish.id} onClick={() => pickDish(dish)} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }}>
              <View style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', background: dish.color || '#E8F5E9' }}>{dish.emoji}</View>
              <View style={{ flex: 1, marginLeft: '10px' }}>
                <View style={{ fontSize: '14px' }}>{dish.name}</View>
                <View style={{ fontSize: '12px', color: '#F44336' }}>¥{dish.price}</View>
              </View>
              <Text style={{ color: '#4CAF50', fontSize: '20px' }}>＋</Text>
            </View>
          )) : loaded && <Text style={{ color: 'var(--color-text-placeholder)', fontSize: '13px' }}>该分类暂无菜品</Text>}
        </View>
      </View>

      {/* 底部保存栏 */}
      <View style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--color-bg-card)', padding: '12px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Text style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{items.length} 道菜</Text>
        <Button block type="primary" style={{ flex: 1 }} loading={saving} onClick={onSave}>保存计划</Button>
      </View>
    </View>
  )
}
