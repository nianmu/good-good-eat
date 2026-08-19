/**
 * Mock 数据 · 当前用户 & 团队
 * 对应规划文档模块 3（团队）和模块 5（个人中心）
 */

window.MOCK_DATA = window.MOCK_DATA || {};

window.MOCK_DATA.user = {
  id: 'user-16tQW',
  nickname: '用户16tQW',
  avatar: '👨',
  code: '38243244',              // 标识码
  teams: [
    { id: 'team-1', name: '我家', memberCount: 4, role: 'organizer', chef: '妈妈' },
    { id: 'team-2', name: '朋友聚餐', memberCount: 6, role: 'member', chef: null },
    { id: 'team-3', name: '社团饭局', memberCount: 12, role: 'member', chef: '老王' }
  ],
  stats: {
    totalOrders: 28,
    totalDishes: 96,
    favoriteDishes: 15
  }
};

// 我的页面功能宫格
window.MOCK_DATA.myFeatures = [
  { id: 'kitchen',    name: '厨房管理', icon: '🍳', color: '#FF9800' },
  { id: 'fridge',     name: '厨房冰箱', icon: '🧊', color: '#2196F3' },
  { id: 'basket',     name: '厨房菜篮', icon: '🛒', color: '#4CAF50' },
  { id: 'diet',       name: '饮食计划', icon: '📅', color: '#9C27B0' },
  { id: 'tutorial',   name: '新手教程', icon: '📖', color: '#607D8B' },
  { id: 'theme',      name: '系统主题', icon: '🎨', color: '#FF5722' },
  { id: 'feedback',   name: '提点意见', icon: '💬', color: '#00BCD4' },
  { id: 'more',       name: '更多功能', icon: '⋯', color: '#9E9E9E' }
];
