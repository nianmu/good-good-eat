'use strict';

/**
 * 购物车/下单页
 * - 列表：qty-stepper 调数量、删除
 * - 团队选择（默认第一个团队，picker 切换）
 * - 合计金额；提交下单 POST /orders → 成功携带订单 id 跳转 order-detail
 */

const store = require('../../utils/store');
const { request, toastError } = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    items: [],
    totalText: '0.00',
    totalAmount: 0,
    totalCount: 0,
    teams: [],
    teamIndex: 0,
    teamId: '',
    submitting: false,
    loading: true,
    teamCartSummary: '' // 团队多人合计（三期）
  },

  onLoad: function () {
    // 订阅购物车变化（如从菜单页返回后自动重建）
    this._onStore = store.on(this._handleStoreChange.bind(this));
    this.loadTeams();
    this.loadDishes();
  },

  onShow: function () {
    this.rebuild();
  },

  onUnload: function () {
    store.off(this._onStore);
  },

  _handleStoreChange: function (key) {
    if (key === 'cart') this.rebuild();
  },

  // ===== 数据 =====
  loadTeams: function () {
    // 团队以 /me 为准，默认第一个团队
    request({ url: '/me', method: 'GET' })
      .then(function (res) {
        const teams = res.user.teams || [];
        this.setData({ teams: teams });
        this.setSelectedTeam(0);
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        const teams = (store.get('user') || {}).teams || [];
        this.setData({ teams: teams });
        this.setSelectedTeam(0);
      }.bind(this));
  },

  setSelectedTeam: function (index) {
    const teams = this.data.teams;
    const idx = Math.min(Math.max(0, index), Math.max(0, teams.length - 1));
    const team = teams[idx];
    this.setData({
      teamIndex: idx,
      teamId: team ? team.id : ''
    });
    this.loadTeamCart();
  },

  // 团队多人合计（GET /teams/{id}/cart；mock 同源）
  loadTeamCart: function () {
    const teamId = this.data.teamId;
    if (!teamId) return;
    request({ url: '/teams/' + teamId + '/cart', method: 'GET' })
      .then(function (res) {
        const items = res.items || [];
        const userSet = {};
        let totalQty = 0;
        items.forEach(function (it) {
          totalQty += it.quantity || 0;
          (it.user_ids || []).forEach(function (uid) { userSet[uid] = true; });
        });
        const people = Object.keys(userSet).length;
        this.setData({
          teamCartSummary: people > 0 ? '团队共 ' + people + ' 人已点 ' + totalQty + ' 份' : ''
        });
      }.bind(this))
      .catch(function () {
        this.setData({ teamCartSummary: '' });
      }.bind(this));
  },

  onTeamChange: function (e) {
    this.setSelectedTeam(Number(e.detail.value));
  },

  loadDishes: function () {
    // 购物车需要菜品快照（名称/emoji/色块/单价）
    request({ url: '/dishes', method: 'GET' })
      .then(function (res) {
        this.dishMap = {};
        (res.items || []).forEach(function (d) { this.dishMap[d.id] = d; }.bind(this));
        this.setData({ loading: false });
        this.rebuild();
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false });
        this.rebuild();
      }.bind(this));
  },

  // ===== 重建购物车列表 =====
  rebuild: function () {
    const cart = store.get('cart') || {};
    const dishMap = this.dishMap || {};
    const items = [];
    let totalAmount = 0;
    let totalCount = 0;

    Object.keys(cart).forEach(function (dishId) {
      const qty = cart[dishId] || 0;
      if (qty <= 0) return;
      const dish = dishMap[dishId] || {};
      const price = Number(dish.price) || 0;
      const item = {
        dish_id: dishId,
        name: dish.name || dishId,
        emoji: dish.emoji || '🍽',
        color: dish.color || '#E0E0E0',
        price: price,
        price_text: util.formatPrice(price),
        quantity: qty,
        total: price * qty,
        total_text: util.formatPrice(price * qty)
      };
      items.push(item);
      totalAmount = totalAmount + price * qty;
      totalCount = totalCount + qty;
    });

    this.setData({
      items: items,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalText: util.formatPrice(totalAmount),
      totalCount: totalCount
    });
  },

  // ===== 交互 =====
  onQtyChange: function (e) {
    const dishId = e.currentTarget.dataset.id;
    store.setCartQuantity(dishId, e.detail.value);
  },

  onRemove: function (e) {
    const dishId = e.currentTarget.dataset.id;
    store.removeFromCart(dishId);
    wx.showToast({ title: '已删除', icon: 'none' });
  },

  goMenu: function () {
    wx.switchTab({ url: '/pages/menu/menu' });
  },

  onSubmit: function () {
    if (this.data.submitting) return;
    if (!this.data.totalCount) {
      wx.showToast({ title: '购物车是空的', icon: 'none' });
      return;
    }
    if (!this.data.teamId) {
      wx.showToast({ title: '请先选择下单团队', icon: 'none' });
      return;
    }
    const items = this.data.items.map(function (it) {
      return { dish_id: it.dish_id, quantity: it.quantity };
    });

    this.setData({ submitting: true });
    request({
      url: '/orders',
      method: 'POST',
      data: { team_id: this.data.teamId, items: items }
    })
      .then(function (order) {
        store.clearCart();
        wx.showToast({ title: '下单成功，取餐码 ' + order.pickup_code, icon: 'none' });
        setTimeout(function () {
          wx.redirectTo({ url: '/pages/order-detail/order-detail?id=' + order.id });
        }, 800);
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ submitting: false });
      }.bind(this));
  }
});