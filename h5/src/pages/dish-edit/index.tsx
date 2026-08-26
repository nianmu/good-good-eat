import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Input, TextArea } from '@nutui/nutui-react-taro'
import { categories as catApi, dishes as dishApi, auth } from '../../api'
import { requireLogin } from '../../utils/auth'

//
// 新建菜品页——你好吃饭
// 名称/emoji/色块/分类/价格/食材/做法（可选）/可见性（公开/团队公开/仅自己）/保存
// 做法填了就一并创建关联菜谱（一道菜=一份做法）
//

const EMOJI_OPTIONS = ['🍖', '🥩', '🐟', '🍗', '🥦', '🍆', '🥚', '🍅', '🌽', '🍚', '🍜', '🥗', '🍲', '🥘', '🍳', '🌶️']
const COLOR_OPTIONS = ['#FFAB91', '#FFCC80', '#EF9A9A', '#90CAF9', '#A5D6A7', '#B39DDB', '#FFF59D', '#FFE082']
const DIFFICULTY_OPTIONS = ['简单', '中等', '较难']
const VISIBILITY_OPTIONS = [
  { key: 'public', label: '公开', desc: '所有人都能看到、点这道菜' },
  { key: 'team', label: '团队公开', desc: '我加入的团队成员都能看到' },
  { key: 'private', label: '仅自己', desc: '只有我能看到、点这道菜' },
]

export default function DishEditPage() {
  const [form, setForm] = useState<any>({
    name: '', emoji: '🍖', color: '#FFAB91', category_id: '', price: '',
    ingredientsText: '', stepsText: '', cookTime: '', difficulty: '',
    visibility: 'public', team_id: '',
  })
  const [categories, setCategories] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useLoad(() => {
    if (!requireLogin('发新菜品需要登录')) return
    Taro.setNavigationBarTitle({ title: '新增菜品' })
    catApi.list().then((cats: any) => {
      setCategories(cats || [])
      if (cats && cats.length) setForm((f: any) => ({ ...f, category_id: cats[0].id }))
      return cats
    }).catch(() => showToast({ title: '分类加载失败', icon: 'none' }))
    auth.me().then((res: any) => {
      const ts = res?.user?.teams || []
      setTeams(ts)
    }).catch(() => {})
  })

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const buildPayload = () => {
    const ingredients = (form.ingredientsText || '').split(/[，,、\n]/).map((s: string) => s.trim()).filter(Boolean)
    const steps = (form.stepsText || '').split('\n').map((s: string) => s.trim()).filter(Boolean)
    const cookTime = form.cookTime ? parseInt(form.cookTime, 10) : null
    const payload: any = {
      category_id: form.category_id,
      name: form.name,
      price: form.price ? parseFloat(form.price) : 0,
      emoji: form.emoji,
      color: form.color,
      ingredients,
      cook_time: cookTime && cookTime > 0 ? cookTime : null,
      difficulty: form.difficulty || null,
      visibility: form.visibility,
      team_id: form.visibility === 'team' ? (form.team_id ? Number(form.team_id) : null) : null,
    }
    if (steps.length) {
      payload.recipe = {
        name: form.name,
        emoji: form.emoji,
        color: form.color,
        ingredients,
        steps,
        cook_time: cookTime && cookTime > 0 ? cookTime : null,
        difficulty: form.difficulty || null,
        is_public: form.visibility === 'public',
      }
    }
    return payload
  }

  const onSave = () => {
    const p = buildPayload()
    if (!p.name.trim()) { showToast({ title: '请填写菜名', icon: 'none' }); return }
    if (!p.category_id) { showToast({ title: '请选择分类', icon: 'none' }); return }
    if (p.visibility === 'team' && !p.team_id) { showToast({ title: '团队公开需选择团队', icon: 'none' }); return }
    if (saving) return
    setSaving(true)
    dishApi.create(p)
      .then((r: any) => {
        showToast({ title: '已发布', icon: 'success' })
        setTimeout(() => Taro.navigateTo({ url: '/pages/dish-detail/index?id=' + r.id }), 600)
      })
      .catch((e: any) => { showToast({ title: e?.message || '发布失败', icon: 'none' }); setSaving(false) })
  }

  const label = { display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '14px 0 8px' } as const
  const inputStyle = { background: 'var(--color-bg-page)', borderRadius: '8px', padding: '0 12px', height: '44px', fontSize: '15px', width: '100%' } as const

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '80px' }}>
      <ScrollView scrollY style={{ height: 'calc(100vh - 80px)' }}>
        <View style={{ background: 'var(--color-bg-card)', padding: '4px 16px 12px', marginBottom: '12px' }}>
          <Text style={label}>菜名 *</Text>
          <Input value={form.name} placeholder="如：我的红烧肉" onChange={(v) => set('name', v)} style={inputStyle} />
          <Text style={label}>分类 *</Text>
          <ScrollView scrollX style={{ whiteSpace: 'nowrap' }}>
            <View style={{ display: 'inline-flex', gap: '8px', paddingTop: 2 }}>
              {categories.map((c: any) => (
                <View key={c.id} onClick={() => set('category_id', c.id)} style={{
                  padding: '6px 14px', borderRadius: '16px', fontSize: '13px',
                  background: String(form.category_id) === String(c.id) ? '#4CAF50' : '#f0f0f0',
                  color: String(form.category_id) === String(c.id) ? '#fff' : '#555', cursor: 'pointer'
                }}>{c.icon} {c.name}</View>
              ))}
            </View>
          </ScrollView>

          <Text style={label}>可见性 *</Text>
          {VISIBILITY_OPTIONS.map((o) => {
            const active = form.visibility === o.key
            return (
              <View key={o.key} onClick={() => set('visibility', o.key)} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: 8,
                borderRadius: 10, cursor: 'pointer',
                border: active ? '2px solid #4CAF50' : '1px solid var(--color-border)',
                background: active ? 'var(--color-primary-bg)' : 'var(--color-bg-card)',
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: 600, color: active ? '#388E3C' : 'var(--color-text-primary)' }}>{o.label}</Text>
                  <Text style={{ display: 'block', fontSize: 11, color: 'var(--color-text-placeholder)', marginTop: 2 }}>{o.desc}</Text>
                </View>
                {active && <Text style={{ color: '#4CAF50', fontSize: 18 }}>✓</Text>}
              </View>
            )
          })}

          {form.visibility === 'team' && (
            <>
              <Text style={label}>归属团队 *</Text>
              <ScrollView scrollX style={{ whiteSpace: 'nowrap' }}>
                <View style={{ display: 'inline-flex', gap: 8 }}>
                  {teams.map((t: any) => (
                    <View key={t.id} onClick={() => set('team_id', t.id)} style={{
                      padding: '6px 14px', borderRadius: 16, fontSize: 13,
                      background: String(form.team_id) === String(t.id) ? '#4CAF50' : '#f0f0f0',
                      color: String(form.team_id) === String(t.id) ? '#fff' : '#555', cursor: 'pointer'
                    }}>{t.name}</View>
                  ))}
                  {teams.length === 0 && <Text style={{ fontSize: 12, color: 'var(--color-text-placeholder)' }}>还没有团队，先到「我的」创建或加入团队</Text>}
                </View>
              </ScrollView>
            </>
          )}
        </View>

        <View style={{ background: 'var(--color-bg-card)', padding: '4px 16px 16px', marginBottom: '12px' }}>
          <Text style={label}>emoji 图标</Text>
          <View style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EMOJI_OPTIONS.map((e) => (
              <View key={e} onClick={() => set('emoji', e)} style={{
                width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, cursor: 'pointer', background: form.emoji === e ? 'var(--color-primary-bg)' : '#f5f5f5',
                border: form.emoji === e ? '2px solid #4CAF50' : '1px solid #eee'
              }}>{e}</View>
            ))}
          </View>
          <Text style={label}>色块</Text>
          <View style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLOR_OPTIONS.map((c) => (
              <View key={c} onClick={() => set('color', c)} style={{
                width: 34, height: 34, borderRadius: 8, background: c, cursor: 'pointer',
                border: form.color === c ? '3px solid #333' : '1px solid #eee'
              }} />
            ))}
          </View>

          <Text style={label}>价格（元，默认 0）</Text>
          <Input type="number" value={form.price} placeholder="如：25" onChange={(v) => set('price', v)} style={inputStyle} />

          <Text style={label}>食材（逗号分隔）</Text>
          <TextArea value={form.ingredientsText} placeholder="例如：五花肉，冰糖，生抽" maxlength={300} onChange={(v) => set('ingredientsText', v)} style={{ width: '100%', minHeight: '60px', background: 'var(--color-bg-page)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px' }} />

          <Text style={label}>做法步骤（选填，多行每行一步）</Text>
          <TextArea value={form.stepsText} placeholder={'例如：\n五花肉切块焯水\n炒糖色下肉翻炒\n加水炖 40 分钟收汁'} maxlength={600} onChange={(v) => set('stepsText', v)} style={{ width: '100%', minHeight: '100px', background: 'var(--color-bg-page)', borderRadius: '8px', padding: '8px 12px', fontSize: '14px' }} />

          <View style={{ display: 'flex', gap: '12px', marginTop: '14px' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>耗时（分钟）</Text>
              <Input type="number" value={form.cookTime} placeholder="如：30" onChange={(v) => set('cookTime', v)} style={{ ...inputStyle, marginTop: 6 }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>难度</Text>
              <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginTop: 6 }}>
                <View style={{ display: 'inline-flex', gap: 8 }}>
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <View key={d} onClick={() => set('difficulty', d)} style={{
                      padding: '4px 12px', borderRadius: 14, fontSize: 12,
                      background: form.difficulty === d ? '#4CAF50' : '#f0f0f0',
                      color: form.difficulty === d ? '#fff' : '#555', cursor: 'pointer'
                    }}>{d}</View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 保存栏 */}
      <View style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--color-bg-card)', padding: '12px 16px', borderTop: '1px solid var(--color-divider)' }}>
        <Button block type="primary" loading={saving} onClick={onSave}>{saving ? '发布中…' : '发布新菜品'}</Button>
      </View>
    </View>
  )
}