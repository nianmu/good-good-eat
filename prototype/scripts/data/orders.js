/**
 * Mock 数据 · 订单
 * 对应规划文档模块 2
 */

window.MOCK_DATA = window.MOCK_DATA || {};

window.MOCK_DATA.orders = [
  {
    id: 'order-1002',
    pickupCode: '1002',
    status: 'completed',        // pending / accepted / cooking / ready / completed
    userId: 'user-16tQW',
    userAvatar: '👨',
    userNickname: '用户16tQW',
    teamName: '我家',
    createdAt: '2026-08-18 11:30:32',
    items: [
      { dishId: 'dish-9', name: '葱花火腿鸡蛋饼', emoji: '🥞', color: '#FFE082', price: 8.00, quantity: 1 }
    ],
    totalAmount: 8.00,
    totalCount: 1
  },
  {
    id: 'order-1001',
    pickupCode: '1001',
    status: 'cooking',
    userId: 'user-16tQW',
    userAvatar: '👨',
    userNickname: '用户16tQW',
    teamName: '我家',
    createdAt: '2026-08-18 11:00:15',
    items: [
      { dishId: 'dish-1', name: '红烧肉', emoji: '🥩', color: '#FFAB91', price: 28.00, quantity: 1 },
      { dishId: 'dish-5', name: '蒜蓉西兰花', emoji: '🥦', color: '#A5D6A7', price: 12.00, quantity: 1 },
      { dishId: 'dish-11', name: '番茄蛋花汤', emoji: '🍅', color: '#EF9A9A', price: 10.00, quantity: 1 }
    ],
    totalAmount: 50.00,
    totalCount: 3
  },
  {
    id: 'order-1003',
    pickupCode: '1003',
    status: 'pending',
    userId: 'user-16tQW',
    userAvatar: '👨',
    userNickname: '用户16tQW',
    teamName: '朋友聚餐',
    createdAt: '2026-08-18 12:05:00',
    items: [
      { dishId: 'dish-3', name: '糖醋排骨', emoji: '🍖', color: '#EF9A9A', price: 32.00, quantity: 2 },
      { dishId: 'dish-10', name: '麻婆豆腐', emoji: '🧈', color: '#FFAB91', price: 16.00, quantity: 1 },
      { dishId: 'dish-15', name: '凉拌黄瓜', emoji: '🥒', color: '#C5E1A5', price: 8.00, quantity: 1 },
      { dishId: 'dish-13', name: '蛋炒饭', emoji: '🍚', color: '#FFE0B2', price: 10.00, quantity: 3 }
    ],
    totalAmount: 114.00,
    totalCount: 7
  }
];

// 订单状态映射
window.MOCK_DATA.orderStatusMap = {
  pending:   { label: '待接单', color: 'var(--color-warning)', bgColor: '#FFF3E0' },
  accepted:  { label: '已接单', color: 'var(--color-info)',    bgColor: '#E3F2FD' },
  cooking:   { label: '制作中', color: 'var(--color-warning)', bgColor: '#FFF3E0' },
  ready:     { label: '待取餐', color: 'var(--color-primary)', bgColor: 'var(--color-primary-bg)' },
  completed: { label: '已完成', color: 'var(--color-text-secondary)', bgColor: '#F5F5F5' }
};
