'use strict';

/**
 * 我的页面（TabBar·我的，对齐原型 profile.html）
 * - 绿色头部：昵称 / 标识码 user_code
 * - 统计三格：总订单 / 点过的菜 / 收藏（取自 /me 或 store）
 * - 我的团队卡片列表（名称 / 角色徽章 / 成员数 / 厨师）
 * - 功能宫格 8 项（点击 toast 开发中）
 */

const { request, toastError } = require('../../utils/request');
const store = require('../../utils/store');

const FEATURES = [
  { id: 'kitchen', name: '厨房管理', icon: '🍳', color: '#FF9800', url: '/pages/recipe-list/recipe-list' },
  { id: 'fridge', name: '厨房冰箱', icon: '🧊', color: '#2196F3', url: '/pages/fridge/fridge' },
  { id: 'basket', name: '厨房菜篮', icon: '🛒', color: '#4CAF50', url: '/pages/basket/basket' },
  { id: 'favorite', name: '我的收藏', icon: '❤️', color: '#E91E63', url: '/pages/favorites/favorites' },
  { id: 'diet', name: '饮食计划', icon: '📅', color: '#9C27B0', url: '/pages/plans/plans' },
  { id: 'tutorial', name: '新手教程', icon: '📖', color: '#607D8B' },
  { id: 'theme', name: '系统主题', icon: '🎨', color: '#FF5722' },
  { id: 'feedback', name: '提点意见', icon: '💬', color: '#00BCD4' },
  { id: 'more', name: '更多功能', icon: '⋯', color: '#9E9E9E' }
];

const TEAM_ICONS = ['🏠', '🍽', '🎓'];
const ROLE_LABELS = { organizer: '组织者', member: '成员' };

Page({
  data: {
    user: { avatar: '👤', nickname: '好好吃饭', code: '' },
    stats: { totalOrders: 0, totalDishes: 0, favoriteDishes: 0 },
    teams: [],
    features: [],
    loading: true,
    refreshing: false
  },

  onLoad: function () {
    const features = FEATURES.map(function (f) {
      // 颜色叠加 12% 透明度作为浅色底（原型 styles 同款手法）
      return Object.assign({}, f, { bgColor: f.color + '1F' });
    });
    this.setData({ features: features });
    this.loadMe();
  },

  onShow: function () {
    this.loadMe(true);
  },

  loadMe: function (silent) {
    if (!silent) this.setData({ loading: true });
    request({ url: '/me', method: 'GET' })
      .then(function (res) {
        const user = res.user;
        store.set('user', user);
        this.applyUser(user);
        this.setData({ loading: false, refreshing: false });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        const cached = store.get('user');
        if (cached) this.applyUser(cached);
        this.setData({ loading: false, refreshing: false });
      }.bind(this));
  },

  applyUser: function (user) {
    const teams = (user.teams || []).map(function (t, idx) {
      return {
        id: t.id,
        name: t.name,
        icon: t.icon || TEAM_ICONS[idx % TEAM_ICONS.length],
        role_label: ROLE_LABELS[t.role] || '成员',
        member_count: t.member_count || 0,
        chef: t.chef || null
      };
    });
    // stats 兼容后端 snake_case 与 mock camelCase
    const raw = user.stats || {};
    const stats = {
      totalOrders: raw.total_orders != null ? raw.total_orders : (raw.totalOrders || 0),
      totalDishes: raw.total_dishes != null ? raw.total_dishes : (raw.totalDishes || 0),
      favoriteDishes: raw.favorite_dishes != null ? raw.favorite_dishes : (raw.favoriteDishes || 0)
    };
    this.setData({
      user: {
        avatar: user.avatar || '👤',
        nickname: user.nickname || '好好吃饭',
        code: user.code || ''
      },
      stats: stats,
      teams: teams
    });
  },

  onTeamTap: function (e) {
    wx.navigateTo({ url: '/pages/team-detail/team-detail?id=' + e.currentTarget.dataset.id });
  },

  onManageTeams: function () {
    wx.navigateTo({ url: '/pages/team-list/team-list' });
  },

  onFeatureTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const feat = FEATURES.find(function (f) { return f.id === id; });
    if (feat && feat.url) {
      wx.navigateTo({ url: feat.url });
      return;
    }
    wx.showToast({ title: '「' + (feat ? feat.name : '') + '」开发中，敬请期待', icon: 'none' });
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    this.loadMe(true);
  },

  onFavoriteTap: function () {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  }
});