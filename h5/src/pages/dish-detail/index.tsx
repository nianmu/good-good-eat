import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useRouter, useLoad } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { InputNumber, Button } from '@nutui/nutui-react-taro'

import { dishes as dishApi, favorites as favApi } from '../../api'
import { store } from '../../store'

// 菜品详情页——好好吃饭（emoji 大图 / 食材 / 做法 / 评分 / 价格 / 数量 / 加购 / 收藏 / 公开菜谱跳转）
export default function DishDetailPage() {
  const router = useRouter()
  const dishId = (router.params as any)?.id
  const [dish, setDish] = useState<any>(null)
  const [qty, setQty] = useState(1)
  const [loading, setLoading] = useState(true)
  const [favorited, setFavorited] = useState(false)
  const [recipeId, setRecipeId] = useState<number | null>(null)

  useLoad(() => {
    if (!dishId) { setLoading(false); return }
    dishApi.detail(dishId)
      .then((d: any) => {
        setDish(d)
        setQty(1)
        setFavorited(!!d.is_favorite)
        // 加载对应公开菜谱（有则显示做法+跳转入口）
        dishApi.recipe(dishId)
          .then((r: any) => { if (r && r.id) setRecipeId(r.id) })
          .catch(() => {})
      })
      .catch((e: any) => showToast({ title: (e as any)?.message || '加载失败', icon: 'none' }))
      .finally(() => setLoading(false))
  }, [dishId])

  const onAddToCart = () => {
    if (!dish) return
    const cur = store.get('cart')[dish.id] || 0
    store.setCartQuantity(dish.id, cur + qty)
    showToast({ title: '已加入购物车', icon: 'success' })
    setTimeout(() => Taro.navigateBack({ delta: 1 }), 600)
  }

  const onFavorite = () => {
    if (!dish) return
    const next = !favorited
    ;(next ? favApi.toggle(dish.id) : favApi.remove(dish.id))
      .then(() => {
        setFavorited(next)
        showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'none' })
      })
      .catch((e: any) => showToast({ title: (e as any)?.message || '操作失败', icon: 'none' }))
  }

  const goRecipe = () => {
    if (recipeId) Taro.navigateTo({ url: `/pages/recipe-detail/index?id=${recipeId}` })
  }

  if (loading) {
    return <View style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-placeholder)' }}>加载中…</View>
  }
  if (!dish) {
    return (
      <View style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-placeholder)' }}>
        <Text style={{ fontSize: '40px' }}>🍽</Text>
        <View>菜品不存在或已下架</View>
      </View>
    )
  }

  const ingredients = dish.ingredients || []
  const ingredientsText = ingredients.join('、')

  return (
    <View className="ggc-page" style={{ position: 'relative' }}>
      <View style={{ flex: 1, overflow: 'auto' }}>
        {/* 大图：emoji 色块 */}
        <View style={{ height: '220px', background: dish.color || '#E0E0E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '96px' }}>
          {dish.emoji || '🍽'}
        </View>

        <View style={{ padding: '16px', background: 'var(--color-bg-card)' }}>
          <View style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Text style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{dish.name}</Text>
            <View onClick={onFavorite} style={{ fontSize: '24px', cursor: 'pointer' }}>
              <Text>{favorited ? '❤️' : '🤍'}</Text>
            </View>
          </View>
          <View style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
            <Text style={{ color: '#FF9800', fontSize: '15px' }}>★ {dish.rating}
              {dish.rating_count ? <Text style={{ color: 'var(--color-text-placeholder)', fontSize: '12px' }}>（{dish.rating_count} 人评）</Text> : null}
            </Text>
            <Text style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>⏱ {dish.cook_time}分钟</Text>
            <Text style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>难度：{dish.difficulty}</Text>
          </View>
          <View style={{ color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: 1.6, marginTop: '10px' }}>{dish.description}</View>
        </View>

        <View style={{ margin: '12px 0', padding: '16px', background: 'var(--color-bg-card)' }}>
          <Text style={{ fontSize: '16px', fontWeight: 600, display: 'block', marginBottom: '10px', color: 'var(--color-text-primary)' }}>食材清单</Text>
          <View style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {ingredients.map((it: string, i: number) => (
              <View key={i} style={{ padding: '6px 12px', borderRadius: '999px', background: 'var(--color-primary-bg)', color: '#388E3C', fontSize: '13px' }}>
                {it}
              </View>
            ))}
          </View>
        </View>

        {/* 做法 / 公开菜谱入口 */}
        <View style={{ margin: '12px 0', padding: '16px', background: 'var(--color-bg-card)' }}>
          <Text style={{ fontSize: '16px', fontWeight: 600, display: 'block', marginBottom: '10px', color: 'var(--color-text-primary)' }}>做法</Text>
          {recipeId ? (
            <View onClick={goRecipe} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'var(--color-primary-bg)', borderRadius: '10px', cursor: 'pointer' }}>
              <Text style={{ fontSize: '24px' }}>📖</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '14px', fontWeight: 600, color: '#388E3C' }}>查看完整做法（图文步骤）</Text>
                <Text style={{ display: 'block', fontSize: '12px', color: '#66BB6A', marginTop: '2px' }}>来自公开菜谱库 · {dish.name}</Text>
              </View>
              <Text style={{ color: '#66BB6A', fontSize: '18px' }}>›</Text>
            </View>
          ) : (
            <View style={{ color: 'var(--color-text-placeholder)', fontSize: '13px', lineHeight: 1.7 }}>
              精选 {dish.name}，以「{ingredientsText}」为主料，火候到位、调味均衡，家常味十足。完整菜谱将在「厨房菜谱」持续补充。
            </View>
          )}
        </View>
      </View>

      {/* 底部操作栏 */}
      <View style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-divider)', flexShrink: 0 }}>
        <View style={{ display: 'flex', alignItems: 'baseline' }}>
          <Text style={{ color: '#F44336', fontSize: '26px', fontWeight: 700 }}>¥{Number(dish.price || 0).toFixed(2)}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <InputNumber value={qty} min={1} onChange={(v: any) => setQty(Math.max(1, Number(v) || 1))} />
        <Button type="primary" size="small" style={{ fontSize: '14px' }} onClick={onAddToCart}>加入购物车</Button>
      </View>
    </View>
  )
}
