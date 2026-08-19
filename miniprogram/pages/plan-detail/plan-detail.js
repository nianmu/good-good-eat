'use strict';

/**
 * 饮食计划详情页（五期：饮食计划）
 * - GET /plans/{id} 查看计划（本人）
 * - 菜品清单数量合计 + 一键加入购物车（把整份计划加购）
 * - 删除计划 DELETE /plans/{id}
 */

const { request, toastError } = require('../../utils/request');
const store = require('../../utils/store');
const ws = require('../../utils/ws');

Page({
  data: {
    id: null,
    plan: null,
    loading: true
  },

  onLoad: function (options) {
    this.setData({ id: options.id });
    this.loadDetail();
  },

  loadDetail: function () {
    this.setData({ loading: true });
    request({ url: '/plans/' + this.data.id, method: 'GET' })
      .then(function (r) {
        this.setData({ plan: r, loading: false });
        wx.setNavigationBarTitle({ title: r.name || '计划详情' });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false });
      }.bind(this));
  },

  addText: function () {
    const plan = this.data.plan;
    if (!plan) return '';
    return (plan.items || []).map(function (it) {
      const dish = it.dish;
      if (!dish) return '';
      return it.quantity > 1 ? dish.name + '×' + it.quantity : dish.name;
    }).filter(Boolean).join('、');
  },

  onAddAll: function () {
    const plan = this.data.plan;
    const dishes = (plan.items || [])
      .map(function (it) { return it.dish; })
      .filter(Boolean);
    if (!dishes.length) {
      wx.showToast({ title: '暂无菜品', icon: 'none' });
      return;
    }
    const cart = Object.assign({}, store.get('cart') || {});
    (plan.items || []).forEach(function (it) {
      if (it.dish) cart[it.dish.id] = (cart[it.dish.id] || 0) + it.quantity;
    });
    store.set('cart', cart);
    dishes.forEach(function (d) {
      ws.send({ event: 'cart.upsert', data: { dish_id: d.id, quantity: cart[d.id], action: 'plus' } });
    });
    wx.showToast({ title: '已加入购物车：' + this.addText(), icon: 'none' });
  },

  onDelete: function () {
    const self = this;
    wx.showModal({
      title: '删除计划',
      content: '确定要删除「' + (this.data.plan.name || '') + '」吗？',
      confirmColor: '#F44336',
      success: function (res) {
        if (!res.confirm) return;
        request({ url: '/plans/' + self.data.id, method: 'DELETE' })
          .then(function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 600);
          })
          .catch(function (err) { toastError(err); });
      }
    });
  }
});
