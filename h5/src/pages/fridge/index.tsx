import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Empty, Skeleton, Tag, Input } from '@nutui/nutui-react-taro'
import { fridge } from '../../api'

//
// 厨房冰箱页——对齐原生 miniprogram/pages/fridge
// 冰箱食材增删 + 「冰箱能做的菜」推荐
//

export default function FridgePage() {
  const [items, setItems] = useState<any[]>([])
  const [suggest, setSuggest] = useState<any[]>([])
  const [addName, setAddName] = useState('')
  const [addQuantity, setAddQuantity] = useState('')
  const [loading, setLoading] = useState(true)

  const loadAll = () => {
    setLoading(true)
    Promise.all([fridge.list(), fridge.suggest()])
      .then((res: any[]) => {
        setItems(res[0] || [])
        setSuggest(res[1] || [])
      })
      .catch(() => showToast({ title: '冰箱加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  }

  useDidShow(() => loadAll())

  const onAdd = () => {
    const name = addName.trim()
    if (!name) { showToast({ title: '请输入食材名称', icon: 'none' }); return }
    fridge.add(name, addQuantity).then(() => {
      setAddName(''); setAddQuantity(''); loadAll()
    }).catch(() => showToast({ title: '添加失败', icon: 'none' }))
  }

  const onDelete = (id: any) => {
    fridge.remove(id).then(() => loadAll()).catch(() => showToast({ title: '删除失败', icon: 'none' }))
  }

  const onSuggestTap = (it: any) => {
    if (it.source === 'recipe') Taro.navigateTo({ url: `/pages/recipe-detail/index?id=${it.id}` })
    else if (it.source === 'dish') Taro.navigateTo({ url: `/pages/dish-detail/index?id=${it.id}` })
  }

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', padding: '12px' }}>
      {/* 添加食材 */}
      <View style={{ display: 'flex', gap: '8px', background: '#fff', padding: '12px', borderRadius: '12px', marginBottom: '12px' }}>
        <Input value={addName} onChange={(v) => setAddName(String(v || ''))} placeholder="食材名称（如：五花肉）" style={{ flex: 1.4, background: '#f5f5f5', borderRadius: '8px', padding: '8px 12px', fontSize: '14px' }} />
        <Input value={addQuantity} onChange={(v) => setAddQuantity(String(v || ''))} placeholder="数量（可选）" style={{ flex: 1, background: '#f5f5f5', borderRadius: '8px', padding: '8px 12px', fontSize: '14px' }} />
        <Button size="small" type="primary" onClick={onAdd} style={{ height: '40px', flexShrink: 0 }}>＋</Button>
      </View>

      {loading ? (
        <View style={{ padding: '8px' }}><Skeleton rows={4} animated /></View>
      ) : (
        <>
          {/* 我的冰箱 */}
          <View style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
            <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 'bold' }}>我的冰箱</Text>
              <Text style={{ fontSize: '13px', color: '#999' }}>{items.length} 种</Text>
            </View>
            {items.length > 0 ? (
              items.map((it) => (
                <View key={it.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-divider)' }}>
                  <Text style={{ fontSize: '20px' }}>🧊</Text>
                  <View style={{ flex: 1, marginLeft: '10px' }}>
                    <View style={{ fontSize: '15px' }}>{it.name}</View>
                    <View style={{ fontSize: '12px', color: '#999' }}>{it.quantity || '—'}</View>
                  </View>
                  <Text onClick={() => onDelete(it.id)} style={{ color: '#F44336', fontSize: '13px', cursor: 'pointer' }}>删除</Text>
                </View>
              ))
            ) : <View style={{ paddingTop: '4px' }}><Empty description="冰箱还是空的，添加点食材吧" imageSize={90} /></View>}
          </View>

          {/* 冰箱能做的菜 */}
          <View style={{ background: '#fff', borderRadius: '12px', padding: '14px 16px' }}>
            <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 'bold' }}>冰箱能做的菜</Text>
              <Text style={{ fontSize: '12px', color: '#999' }}>命中 2 种以上食材</Text>
            </View>
            {suggest.length > 0 ? (
              suggest.map((s) => (
                <View key={s.source + s.id} onClick={() => onSuggestTap(s)} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-divider)', cursor: 'pointer' }}>
                  <View style={{ width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', background: s.color || '#E8F5E9' }}>{s.emoji}</View>
                  <View style={{ flex: 1, marginLeft: '10px' }}>
                    <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Text style={{ fontSize: '15px', fontWeight: '600' }}>{s.name}</Text>
                      <Tag type={s.source === 'recipe' ? 'primary' : 'warning'} plain>{s.source === 'recipe' ? '我的菜谱' : '平台菜品'}</Tag>
                    </View>
                    <View style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>命中 {(s.matched || []).length}/{(s.total || 0)} · {(s.matched || []).join('、')}</View>
                  </View>
                  <Text style={{ color: '#ccc' }}>›</Text>
                </View>
              ))
            ) : <View style={{ paddingTop: '4px' }}><Empty description="冰箱食材还凑不齐一道菜，多囤点吧" imageSize={90} /></View>}
          </View>
        </>
      )}
    </View>
  )
}
