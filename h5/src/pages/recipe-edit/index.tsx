import { View, Text } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { showToast } from '../../components/app-toast'
import { useState } from 'react'
import { Button, Input, TextArea } from '@nutui/nutui-react-taro'
import { recipes } from '../../api'

//
// 新建 / 编辑菜谱页——对齐原生 miniprogram/pages/recipe-edit
// 名称 / emoji / 色块 / 描述 / 食材(逗号→数组) / 步骤(多行→数组) / 耗时 / 难度
//

const EMOJI_OPTIONS = ['🍖', '🥩', '🐟', '🍗', '🥦', '🍆', '🥚', '🍅', '🌽', '🍚', '🍜', '🥗', '🍲', '🥘', '🍳']
const COLOR_OPTIONS = ['#FFAB91', '#FFCC80', '#EF9A9A', '#90CAF9', '#A5D6A7', '#B39DDB', '#FFF59D', '#FFE082']
const DIFFICULTY_OPTIONS = ['简单', '中等', '较难']

export default function RecipeEditPage() {
  const [id, setId] = useState<any>(null)
  const [form, setForm] = useState<any>({
    name: '', emoji: '🍽', color: '#FFAB91', description: '',
    ingredientsText: '', stepsText: '', cookTime: '', difficulty: ''
  })
  const [saving, setSaving] = useState(false)

  useLoad((p) => {
    const rid = p && p.id
    if (rid) {
      setId(rid)
      Taro.setNavigationBarTitle({ title: '编辑菜谱' })
      recipes.detail(rid)
        .then((r: any) => setForm({
          name: r.name || '', emoji: r.emoji || '🍽', color: r.color || '#FFAB91', description: r.description || '',
          ingredientsText: (r.ingredients || []).join('，'), stepsText: (r.steps || []).join('\n'),
          cookTime: r.cook_time ? String(r.cook_time) : '', difficulty: r.difficulty || ''
        }))
        .catch(() => {
          showToast({ title: '加载失败', icon: 'none' })
        })
    } else {
      Taro.setNavigationBarTitle({ title: '新建菜谱' })
    }
  })

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const buildPayload = () => {
    const ingredients = (form.ingredientsText || '')
      .split(/[，,、\n]/).map((s: string) => s.trim()).filter(Boolean)
    const steps = (form.stepsText || '')
      .split('\n').map((s: string) => s.trim()).filter(Boolean)
    const cookTime = form.cookTime ? parseInt(form.cookTime, 10) : null
    return {
      name: form.name, emoji: form.emoji, color: form.color, description: form.description,
      ingredients, steps,
      cook_time: cookTime && cookTime > 0 ? cookTime : null,
      difficulty: form.difficulty || null
    }
  }

  const onSave = () => {
    const payload = buildPayload()
    if (!payload.name.trim()) { showToast({ title: '请填写菜谱名称', icon: 'none' }); return }
    if (!payload.ingredients.length) { showToast({ title: '请填写至少一种食材', icon: 'none' }); return }
    if (saving) return
    setSaving(true)
    const call = id ? recipes.update(id, payload) : recipes.create(payload)
    call.then(() => {
      showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    }).catch(() => {
      showToast({ title: '保存失败', icon: 'none' })
      setSaving(false)
    })
  }

  const label = { display: 'block', fontSize: '14px', fontWeight: 600, color: '#333', margin: '16px 0 8px' } as const
  const inputStyle = { marginBottom: '4px' } as const

  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '90px' }}>
      <View style={{ background: '#fff', padding: '4px 16px 16px' }}>
        <Text style={label}>菜谱名称</Text>
        <Input value={form.name} placeholder="例如：妈妈的糖醋里脊" onChange={(v) => set('name', v)} style={inputStyle} />

        <Text style={label}>图标（emoji）</Text>
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {EMOJI_OPTIONS.map((e) => (
            <View key={e} onClick={() => set('emoji', e)} style={{
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
              borderRadius: '10px', border: form.emoji === e ? '2px solid #4CAF50' : '2px solid transparent',
              background: form.emoji === e ? 'var(--color-primary-bg)' : '#f5f5f5'
            }}>{e}</View>
          ))}
        </View>

        <Text style={label}>色块颜色</Text>
        <View style={{ display: 'flex', gap: '10px' }}>
          {COLOR_OPTIONS.map((c) => (
            <View key={c} onClick={() => set('color', c)} style={{
              width: '32px', height: '32px', borderRadius: '8px', background: c,
              border: form.color === c ? '3px solid #1A1A1A' : '2px solid transparent'
            }} />
          ))}
        </View>

        <Text style={label}>简介</Text>
        <TextArea value={form.description} placeholder="用一句话介绍这道菜（可选）" maxlength={200} onChange={(v) => set('description', v)} style={{ width: '100%' }} />
      </View>

      <View style={{ background: '#fff', padding: '4px 16px 16px', marginTop: '12px' }}>
        <Text style={label}>食材（用逗号分隔）</Text>
        <TextArea value={form.ingredientsText} placeholder="例如：里脊肉，番茄酱，醋，糖" onChange={(v) => set('ingredientsText', v)} style={{ width: '100%' }} />

        <Text style={label}>做法步骤（每行一步）</Text>
        <TextArea value={form.stepsText} placeholder={'例如：\n里脊切条腌 10 分钟\n裹淀粉下锅炸至金黄\n炒糖醋汁收汁裹匀'} onChange={(v) => set('stepsText', v)} style={{ width: '100%', minHeight: '120px' }} />
      </View>

      <View style={{ background: '#fff', padding: '4px 16px 16px', marginTop: '12px' }}>
        <Text style={label}>耗时（分钟）</Text>
        <Input type="number" value={form.cookTime} placeholder="例如：30" onChange={(v) => set('cookTime', v)} style={inputStyle} />

        <Text style={label}>难度</Text>
        <View style={{ display: 'flex', gap: '10px' }}>
          {DIFFICULTY_OPTIONS.map((d) => (
            <View key={d} onClick={() => set('difficulty', d)} style={{
              padding: '8px 18px', borderRadius: '16px', fontSize: '14px',
              background: form.difficulty === d ? '#4CAF50' : '#f0f0f0',
              color: form.difficulty === d ? '#fff' : '#555'
            }}>{d}</View>
          ))}
        </View>
      </View>

      {/* 保存栏 */}
      <View style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', padding: '12px 16px', borderTop: '1px solid var(--color-border)' }}>
        <Button block type="primary" loading={saving} onClick={onSave}>{saving ? '保存中…' : '保存菜谱'}</Button>
      </View>
    </View>
  )
}
