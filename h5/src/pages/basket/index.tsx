import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Empty, Skeleton, Input } from '@nutui/nutui-react-taro'
import { basket } from '../../api'

//
// 厨房菜篮页——对齐原生 miniprogram/pages/basket
// 待购：增 / 勾选完成 / 删
//

export default function BasketPage() {
  const [items, setItems] = useState<any[]>([])
  const [addName, setAddName] = useState('')
  const [addQuantity, setAddQuantity] = useState('')
  const [loading, setLoading] = useState(true)

  const loadList = () => {
    setLoading(true)
    basket.list().then((res: any) => setItems(res || []))
      .catch(() => showToast({ title: '菜篮加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  }

  useDidShow(() => loadList())

  const checkedCount = items.filter((i) => i.checked).length

  const onAdd = () => {
    const name = addName.trim()
    if (!name) { showToast({ title: '请输入待购名称', icon: 'none' }); return }
    basket.add(name, addQuantity).then(() => { setAddName(''); setAddQuantity(''); loadList() })
      .catch(() => showToast({ title: '添加失败', icon: 'none' }))
  }

  const onCheck = (it: any) => {
    basket.toggle(it.id, !it.checked).then(() => loadList())
      .catch(() => showToast({ title: '操作失败', icon: 'none' }))
  }

  const onDelete = (id: any) => {
    basket.remove(id).then(() => loadList()).catch(() => showToast({ title: '删除失败', icon: 'none' }))
  }

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', padding: '12px' }}>
      {/* 添加待购 */}
      <View style={{ display: 'flex', gap: '8px', background: 'var(--color-bg-card)', padding: '12px', borderRadius: '12px', marginBottom: '12px' }}>
        <Input value={addName} onChange={(v) => setAddName(String(v || ''))} placeholder="待购物品（如：鸡蛋）" style={{ flex: 1.4, background: 'var(--color-bg-page)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px' }} />
        <Input value={addQuantity} onChange={(v) => setAddQuantity(String(v || ''))} placeholder="数量（可选）" style={{ flex: 1, background: 'var(--color-bg-page)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px' }} />
        <Button size="small" type="primary" onClick={onAdd} style={{ height: '40px', flexShrink: 0 }}>＋</Button>
      </View>

      {loading ? (
        <View style={{ padding: '8px' }}><Skeleton rows={4} animated /></View>
      ) : (
        <View style={{ background: 'var(--color-bg-card)', borderRadius: '12px', padding: '14px 16px' }}>
          <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <Text style={{ fontSize: '16px', fontWeight: 'bold' }}>待采购</Text>
            <Text style={{ fontSize: '13px', color: 'var(--color-text-placeholder)' }}>{items.length} 项 · {checkedCount} 已完成</Text>
          </View>
          {items.length > 0 ? (
            items.map((it) => (
              <View key={it.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-divider)' }}>
                <View onClick={() => onCheck(it)} style={{
                  width: '22px', height: '22px', borderRadius: '50%', border: '2px solid #4CAF50',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px',
                  background: it.checked ? '#4CAF50' : 'transparent', cursor: 'pointer', flexShrink: 0
                }}>{it.checked ? '✓' : ''}</View>
                <View style={{ flex: 1, marginLeft: '12px' }}>
                  <View style={{ fontSize: '15px', color: it.checked ? '#bbb' : '#1A1A1A', textDecoration: it.checked ? 'line-through' : 'none' }}>{it.name}</View>
                  <View style={{ fontSize: '12px', color: 'var(--color-text-placeholder)' }}>{it.quantity || '—'}</View>
                </View>
                <Text onClick={() => onDelete(it.id)} style={{ color: '#F44336', fontSize: '13px', cursor: 'pointer' }}>删除</Text>
              </View>
            ))
          ) : <View style={{ paddingTop: '4px' }}><Empty description="菜篮空空，把要买的东西加进来吧" imageSize={90} /></View>}
        </View>
      )}
    </View>
  )
}
