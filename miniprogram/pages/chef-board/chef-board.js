'use strict';

/**
 * 厨师看板（三期）
 * - 顶部聚合卡：待做订单数 / 按菜合并（菜名 xN + 食材）/ 食材汇总
 * - 订单列表：取餐码/状态/下单人/菜品摘要；按状态推进（接单→制作→出餐→取餐）
 * - 订阅 ws order.status_changed 实时刷新
 */

const { request, toastError } = require('../../utils/request');
const util = require('../../utils/util');
const ws = require('../../utils/ws');

const STATUS_ACTION = {
  pending: { label: '接单', act: 'accept' },
  accepted: { label: '开始制作', act: 'status', status: 'cooking' },
  cooking: { label: '完成制作', act: 'status', status: 'ready' },
  ready: { label: '确认取餐', act: 'status', status: 'completed' }
};

Page({
  data: {
    loading: true,
    refreshing: false,
    orders: [],
    ordersCount: 0,
    dishes: [],
    ingredients: []
  },

  onLoad: function () {
    this._onStatus = ws.on('order.status_changed', this.loadAll.bind(this));
    this._onCreated = ws.on('order.created', this.loadAll.bind(this));
  },

  onShow: function () {
    this.loadAll();
  },

  onUnload: function () {
    if (this._onStatus) ws.off('order.status_changed', this._onStatus);
    if (this._onCreated) ws.off('order.created', this._onCreated);
  },

  onPullDownRefresh: function () {
    this.loadAll();
  },

  loadAll: function () {
    this.setData({ loading: true });
    Promise.all([
      request({ url: '/chef/orders', method: 'GET' }),
      request({ url: '/chef/orders/aggregated', method: 'GET' })
    ]).then(function (res) {
      const orders = (res[0].items || []).map(this.normalize.bind(this));
      const agg = res[1] || {};
      this.setData({
        orders: orders,
        ordersCount: agg.orders_count || 0,
        dishes: agg.dishes || [],
        ingredients: agg.ingredients || [],
        loading: false,
        refreshing: false
      });
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ loading: false, refreshing: false });
    }.bind(this));
  },

  normalize: function (order) {
    const items = order.items || [];
    const names = items.slice(0, 2).map(function (i) { return i.name; });
    let summary = names.join('、');
    if (items.length > 2) summary += ' 等' + items.length + '种';
    const act = STATUS_ACTION[order.status];
    return {
      id: order.id,
      pickup_code: order.pickup_code,
      status: order.status,
      user_nickname: order.user ? order.user.nickname : '',
      summary: summary,
      time_text: util.formatTime(order.created_at),
      action_label: act ? act.label : ''
    };
  },

  onOrderTap: function (e) {
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },

  onAction: function (e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find(function (o) { return o.id === id; });
    if (!order) return;
    const act = STATUS_ACTION[order.status];
    if (!act) return;

    let p;
    if (act.act === 'accept') {
      p = request({ url: '/orders/' + id + '/accept', method: 'POST' });
    } else {
      p = request({ url: '/orders/' + id + '/status', method: 'POST', data: { status: act.status } });
    }
    p.then(function () {
      wx.showToast({ title: act.label + '成功', icon: 'none' });
      this.loadAll();
    }.bind(this)).catch(function (err) {
      toastError(err);
    }.bind(this));
  }
});