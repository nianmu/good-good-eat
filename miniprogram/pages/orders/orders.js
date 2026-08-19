'use strict';

/**
 * 订单列表页（TabBar·订单）
 * - 顶部状态筛选（全部/待接单/制作中/待取餐/已完成）
 * - 分页加载：上拉触底加载下一页（scroll-view lower）
 * - 下拉刷新；角色切换入口（我的订单/厨师看板）占位 toast
 * - 卡片：状态徽章 / 取餐码 / 时间 / 金额 / 菜品摘要
 */

const config = require('../../utils/config');
const { request, toastError } = require('../../utils/request');
const util = require('../../utils/util');

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待接单' },
  { key: 'cooking', label: '制作中' },
  { key: 'ready', label: '待取餐' },
  { key: 'completed', label: '已完成' }
];

Page({
  data: {
    statusTabs: STATUS_TABS,
    status: '',
    orders: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    refreshing: false,
    roleMode: 'mine'
  },

  onLoad: function () {
    this._firstShow = true;
    this.loadOrders(true);
  },

  onShow: function () {
    // 从订单详情返回时状态可能已推进，刷新列表
    if (!this._firstShow) {
      this.loadOrders(true, { silent: true });
    }
    this._firstShow = false;
  },

  // ===== 加载 =====
  loadOrders: function (reset, opts) {
    opts = opts || {};
    if (reset) {
      this.setData({ page: 1, loading: true });
    }
    const page = reset ? 1 : this.data.page + 1;
    request({
      url: '/orders?page=' + page + '&page_size=' + (config.pageSize || 8) + '&status=' + encodeURIComponent(this.data.status),
      method: 'GET'
    })
      .then(function (res) {
        const items = (res.items || []).map(this.normalizeOrder.bind(this));
        this.setData({
          orders: reset ? items : this.data.orders.concat(items),
          page: res.page || page,
          hasMore: !!res.has_more,
          loading: false,
          loadingMore: false,
          refreshing: false
        });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false, loadingMore: false, refreshing: false });
      }.bind(this));
  },

  normalizeOrder: function (order) {
    const items = order.items || [];
    const names = items.slice(0, 2).map(function (i) { return i.name; });
    let summary = names.join('、');
    if (items.length > 2) summary += ' 等' + items.length + '种';
    return {
      id: order.id,
      pickup_code: order.pickup_code,
      status: order.status,
      team_name: order.team_name || '',
      summary: summary,
      time_text: util.formatTime(order.created_at),
      amount_text: util.formatPrice(order.total_amount)
    };
  },

  // ===== 交互 =====
  onStatusTap: function (e) {
    const key = e.currentTarget.dataset.key || '';
    if (key === this.data.status) return;
    this.setData({ status: key });
    this.loadOrders(true);
  },

  onLoadMore: function () {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    this.loadOrders(false);
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    this.loadOrders(true, { silent: true });
  },

  onOrderTap: function (e) {
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },

  onRoleTap: function () {
    wx.navigateTo({ url: '/pages/chef-board/chef-board' });
  },

  goMenu: function () {
    wx.switchTab({ url: '/pages/menu/menu' });
  }
});