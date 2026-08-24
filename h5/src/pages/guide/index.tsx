import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'

//
// 使用指南——好好吃饭软件使用流程介绍
//

const STEPS = [
  { icon: '🏠', title: '第一步：加入或创建团队', content: '进入「我的」页面，创建一个团队（如「我家」「美食社团」）或输入邀请码加入已有团队。团队成员共享点菜和下单。' },
  { icon: '🍽', title: '第二步：浏览菜品，加入购物车', content: '在「菜谱」主页，左侧切换分类（荤菜/蔬菜/汤羹/主食等），右侧点「+」将想吃的菜加入购物车，也可以点击菜品查看详情、收藏喜欢的菜。' },
  { icon: '🛒', title: '第三步：提交订单', content: '点满后点击「下单」，选择你的团队并提交，系统自动生成取餐码（如 1002）。订单状态实时同步给所有成员。' },
  { icon: '👨‍🍳', title: '第四步：厨师接单做菜', content: '团队指定的厨师（或任意成员认领）进入「厨师看板」查看要做的菜，按顺序完成，点击「开始制作→完成制作→确认取餐」推进状态。' },
  { icon: '✨', title: '第五步：随机点菜 / 今天吃什么', content: '不知道吃什么？试试「随机推荐」或输入人数让系统智能推荐荤素搭配的一轮饭。' },
  { icon: '📋', title: '第六步：发现公开菜谱', content: '在「我的→厨房管理」进入菜谱库，浏览 50+ 道家常菜的完整做法步骤，你也可以创建自己的菜谱并公开分享。' },
  { icon: '❄️', title: '第七步：厨房冰箱/菜篮', content: '冰箱记录你现有的食材，系统会推荐能做的菜；菜篮是待采购清单，勾选已买条目随时核对。' },
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
        <Text>更多功能持续更新中，有问题请在「我的」页面提点意见 💬</Text>
      </View>
    </View>
  )
}
