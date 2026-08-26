import { View, Text } from '@tarojs/components'

//
// 使用指南——好好吃饭软件使用流程介绍
//

const STEPS = [
  { icon: '🏠', title: '第一步：加入或创建团队', content: '进入「我的」页面，创建一个团队（如「我家」「美食社团」）或输入邀请码加入已有团队。团队成员共享发饭局、点菜和做菜。' },
  { icon: '🍽', title: '第二步：发起饭局，一起点菜', content: '在「菜谱」主页挑想吃的菜加入购物车，满后点击「创建饭局」选择团队与类型（日常联动冰箱 / 聚餐独立食材），所有成员都能看到并继续加菜。' },
  { icon: '🥬', title: '第三步：备菜与食材核对', content: '饭局进入「备菜」后，食材汇总里 fridge 已有的高亮、缺的置灰；有菜还没指派厨师的先指派（「我来做」或指定成员）。' },
  { icon: '👨‍🍳', title: '第四步：开始制作，逐道推进', content: '进入「烹饪」后，每道菜的厨师按「待备菜→待烹饪→烹饪中→已完成」逐道推进；全部做完饭局自动完成，无需手动收尾。' },
  { icon: '✨', title: '第五步：结束与复用', content: '饭局完成后可「再来一餐」一键复用，或「存为菜谱」把本次菜单保存成菜谱草稿；不知道吃什么还能用「随机推荐」。' },
  { icon: '📋', title: '第六步：菜谱库与厨房', content: '在「我的→厨房管理」进入菜谱库查看做法步骤、创建自己的菜谱并公开分享；冰箱记录现有食材、菜篮是待采购清单。' },
]

export default function GuidePage() {
  return (
    <View style={{ minHeight: '100vh', background: 'var(--color-bg-page)', paddingBottom: '32px' }}>
      {/* 顶部Banner */}
      <View style={{ background: 'linear-gradient(135deg, #4CAF50, #388E3C)', padding: '28px 20px 22px', color: '#fff' }}>
        <Text style={{ fontSize: '20px', fontWeight: 'bold' }}>好好吃饭 · 使用指南</Text>
        <Text style={{ display: 'block', fontSize: '13px', opacity: 0.85, marginTop: '6px' }}>一人点菜、全家共享，让做饭更简单</Text>
      </View>

      {/* 步骤列表 */}
      <View style={{ padding: '12px 12px 0' }}>
        {STEPS.map((s, i) => (
          <View key={i} style={{ background: 'var(--color-bg-card)', borderRadius: '12px', padding: '16px', marginBottom: '10px', display: 'flex', gap: '14px' }}>
            <View style={{
              width: '44px', height: '44px', borderRadius: '12px', background: 'var(--color-primary-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0
            }}>{s.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{s.title}</Text>
              <Text style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', lineHeight: 1.7 }}>{s.content}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* 底部提示 */}
      <View style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--color-text-placeholder)', fontSize: '12px' }}>
        <Text>更多功能持续更新中，祝你和家人好好吃饭 🍚</Text>
      </View>
    </View>
  )
}
