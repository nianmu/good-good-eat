import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Dialog, Empty, Skeleton, Tag } from '@nutui/nutui-react-taro'
import { recipes } from '../../api'
import store from '../../store'

//
// 菜谱详情页——对齐原生 miniprogram/pages/recipe-detail
// 支持公开/私有菜谱，作者昵称，收藏按钮
//

export default function RecipeDetailPage() {
  const [id, setId] = useState<any>(null)
  const [recipe, setRecipe] = useState<any>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [delVisible, setDelVisible] = useState(false)
  const [favorited, setFavorited] = useState(false)

  const loadRecipe = (rid: any) => {
    recipes.detail(rid).then((r: any) => {
      const user = store.get('user')
      const owner = user && user.id != null && String(user.id) === String(r.user_id)
      setRecipe(r)
      setIsOwner(!!owner)
      setFavorited(!!r.is_favorite)
    }).catch(() => showToast({ title: '加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  }

  useLoad((p) => {
    const rid = p && p.id
    setId(rid)
    loadRecipe(rid)
  })

  const goEdit = () => Taro.navigateTo({ url: `/pages/recipe-edit/index?id=${id}` })

  const doDelete = () => {
    recipes.remove(id).then(() => {
      showToast({ title: '已删除', icon: 'success' })
      setDelVisible(false)
      setTimeout(() => Taro.navigateBack(), 600)
    }).catch(() => showToast({ title: '删除失败', icon: 'none' }))
  }

  const toggleFavorite = () => {
    const next = !favorited
    const call = next ? recipes.favorite(id) : recipes.unfavorite(id)
    call.then(() => {
      setFavorited(next)
      showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' })
    }).catch((e: any) => showToast({ title: (e as any)?.message || '操作失败', icon: 'none' }))
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
      <View style={{ height: '180px', background: recipe.color || 'var(--color-primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '90px' }}>
        {recipe.emoji || '🍽'}
      </View>

      <View style={{ background: 'var(--color-bg-card)', padding: '16px', marginTop: '12px' }}>
        <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Text style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{recipe.name}</Text>
          {recipe.is_public && <Tag type="success" plain>公开</Tag>}
        </View>
        {recipe.author && <Text style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-placeholder)', marginTop: '3px' }}>作者：{recipe.author}</Text>}
        <View style={{ display: 'flex', gap: '14px', fontSize: '13px', color: 'var(--color-text-placeholder)', marginTop: '6px' }}>
          <Text>⏱ {recipe.cook_time ? `${recipe.cook_time} 分钟` : '—'}</Text>
          {recipe.difficulty && <Text>难度：{recipe.difficulty}</Text>}
        </View>
        <Text style={{ display: 'block', fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '10px' }}>{recipe.description || '暂无简介'}</Text>
      </View>

      {/* 食材清单 */}
      <View style={{ background: 'var(--color-bg-card)', padding: '16px', marginTop: '12px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--color-text-primary)' }}>食材清单</Text>
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {(recipe.ingredients || []).map((ing: string, i: number) => (
            <Text key={i} style={{ background: 'var(--color-primary-bg)', color: '#388E3C', padding: '6px 12px', borderRadius: '16px', fontSize: '13px' }}>{ing}</Text>
          ))}
        </View>
      </View>

      {/* 做法步骤 */}
      <View style={{ background: 'var(--color-bg-card)', padding: '16px', marginTop: '12px' }}>
        <Text style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', color: 'var(--color-text-primary)' }}>做法步骤</Text>
        {(recipe.steps || []).length > 0 ? (
          (recipe.steps || []).map((s: string, i: number) => (
            <View key={i} style={{ display: 'flex', marginBottom: '14px' }}>
              <View style={{
                width: '24px', height: '24px', borderRadius: '50%', background: '#4CAF50', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0
              }}>{i + 1}</View>
              <Text style={{ marginLeft: '10px', fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>{s}</Text>
            </View>
          ))
        ) : <Text style={{ color: 'var(--color-text-placeholder)', fontSize: '13px' }}>暂未填写做法步骤</Text>}
      </View>

      {/* 底部操作栏 */}
      <View style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--color-bg-card)', display: 'flex', gap: '12px', padding: '12px 16px', borderTop: '1px solid var(--color-divider)' }}>
        {/* 收藏按钮（所有人可见） */}
        <Button
          plain type={favorited ? 'danger' : 'primary'}
          style={{ flex: 1, fontSize: '13px' }}
          onClick={toggleFavorite}
        >{favorited ? '❤️ 已收藏' : '🤍 收藏'}</Button>
        {isOwner && (
          <>
            <Button plain type="primary" style={{ flex: 1 }} onClick={goEdit}>编辑</Button>
            <Button plain type="danger" style={{ flex: 1 }} onClick={() => setDelVisible(true)}>删除</Button>
          </>
        )}
      </View>

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
