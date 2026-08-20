import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { useState } from 'react'
import { Button, Dialog, Empty, Skeleton, Tag } from '@nutui/nutui-react-taro'
import { recipes } from '../../api'
import store from '../../store'

//
// 菜谱详情页——对齐原生 miniprogram/pages/recipe-detail
//

export default function RecipeDetailPage() {
  const [id, setId] = useState<any>(null)
  const [recipe, setRecipe] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [delVisible, setDelVisible] = useState(false)

  useLoad((p) => {
    const rid = p && p.id
    setId(rid)
    recipes.detail(rid).then((r: any) => {
      const user = store.get('user')
      const owner = user && user.id != null && String(user.id) === String(r.user_id)
      setRecipe(r)
      setIsOwner(!!owner)
    }).catch(() => Taro.showToast({ title: '加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  })

  const goEdit = () => Taro.navigateTo({ url: `/pages/recipe-edit/index?id=${id}` })

  const doDelete = () => {
    recipes.remove(id).then(() => {
      Taro.showToast({ title: '已删除', icon: 'success' })
      setDelVisible(false)
      setTimeout(() => Taro.navigateBack(), 600)
    }).catch(() => Taro.showToast({ title: '删除失败', icon: 'none' }))
  }

  if (loading) {
    return <View style={{ padding: '16px' }}><Skeleton rows={6} animated /></View>
  }
  if (!recipe) {
    return (
      <View style={{ paddingTop: '20vh', textAlign: 'center' }}>
        <Empty description="菜谱不存在或已删除" imageSize={120} />
      </View>
    )
  }

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: isOwner ? '80px' : '0' }}>
      {/* 大图 */}
      <View style={{ height: '180px', background: recipe.color || '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '90px' }}>
        {recipe.emoji || '🍽'}
      </View>

      <View style={{ background: '#fff', padding: '16px', marginTop: '12px' }}>
        <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Text style={{ fontSize: '20px', fontWeight: 'bold' }}>{recipe.name}</Text>
          {recipe.is_public && <Tag type="success" plain>公开</Tag>}
        </View>
        <View style={{ display: 'flex', gap: '14px', fontSize: '13px', color: '#888', marginTop: '6px' }}>
          <Text>⏱ {recipe.cook_time ? `${recipe.cook_time} 分钟` : '—'}</Text>
          {recipe.difficulty && <Text>难度：{recipe.difficulty}</Text>}
        </View>
        <Text style={{ display: 'block', fontSize: '14px', color: '#666', marginTop: '10px' }}>{recipe.description || '暂无简介'}</Text>
      </View>

      {/* 食材清单 */}
      <View style={{ background: '#fff', padding: '16px', marginTop: '12px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>食材清单</Text>
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {(recipe.ingredients || []).map((ing: string, i: number) => (
            <Text key={i} style={{ background: 'var(--color-primary-bg)', color: '#388E3C', padding: '6px 12px', borderRadius: '16px', fontSize: '13px' }}>{ing}</Text>
          ))}
        </View>
      </View>

      {/* 做法步骤 */}
      <View style={{ background: '#fff', padding: '16px', marginTop: '12px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>做法步骤</Text>
        {(recipe.steps || []).length > 0 ? (
          (recipe.steps || []).map((s: string, i: number) => (
            <View key={i} style={{ display: 'flex', marginBottom: '14px' }}>
              <View style={{
                width: '24px', height: '24px', borderRadius: '50%', background: '#4CAF50', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0
              }}>{i + 1}</View>
              <Text style={{ marginLeft: '10px', fontSize: '14px', color: '#444', lineHeight: '1.6' }}>{s}</Text>
            </View>
          ))
        ) : <Text style={{ color: '#999', fontSize: '13px' }}>暂未填写做法步骤</Text>}
      </View>

      {/* 底部操作栏 */}
      {isOwner && (
        <View style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', display: 'flex', gap: '12px', padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
          <Button plain type="primary" style={{ flex: 1 }} onClick={goEdit}>编辑</Button>
          <Button plain type="danger" style={{ flex: 1 }} onClick={() => setDelVisible(true)}>删除</Button>
        </View>
      )}

      <Dialog
        visible={delVisible}
        title="删除菜谱"
        content={`确定要删除「${recipe.name || ''}」吗？`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={doDelete}
        onCancel={() => setDelVisible(false)}
        onClose={() => setDelVisible(false)}
      />
    </View>
  )
}
