'use strict';

/**
 * 我的饮食计划列表页（五期：饮食计划）
 * - GET /plans 分页加载我的计划，含菜品摘要
 * - 卡片：名称 / 备注 / 菜品名+emoji 摘要 / 合计数量
 * - 点击进详情，右下角 + 新建入口进 plan-edit
 */

const { request, toastError } = require('../../utils/request');

Page({
  data: {
    list: [],
    total: 0,
    page: 1,
    pageSize: 10,
    loading: true,
    loadingMore: false,
    refreshing: false,
    hasMore: false
  },

  onLoad: function () {
    this.loadList(true);
  },

  onShow: function () {
    if (this._loaded) this.loadList(true);
  },

  loadList: function (reset) {
    if (reset) this.setData({ loading: true, page: 1 });
    const page = reset ? 1 : this.data.page;
    request({
      url: '/plans',
      method: 'GET',
      data: { page: page, page_size: this.data.pageSize }
    }).then(function (res) {
      this._loaded = true;
      const items = res.items || [];
      this.setData({
        list: reset ? items : this.data.list.concat(items),
        total: res.total || 0,
        page: page + 1,
        hasMore: items.length >= this.data.pageSize,
        loading: false,
        loadingMore: false,
        refreshing: false
      });
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ loading: false, loadingMore: false, refreshing: false });
    }.bind(this));
  },

  onPullDownRefresh: function () {
    this.loadList(true);
  },

  onReachBottom: function () {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    this.loadList(false);
  },

  onPlanTap: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/plan-detail/plan-detail?id=' + id });
  },

  onCreate: function () {
    wx.navigateTo({ url: '/pages/plan-edit/plan-edit' });
  }
});
