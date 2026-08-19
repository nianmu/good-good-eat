'use strict';

/**
 * 我的收藏页（四期：收藏菜品）
 * - GET /favorites 分页加载收藏的菜品（含完整信息）
 * - 点击进入菜品详情；支持取消收藏
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
      url: '/favorites',
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

  onDishTap: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + id });
  },

  onGoMenu: function () {
    wx.switchTab({ url: '/pages/menu/menu' });
  },

  onUnfavorite: function (e) {
    const id = e.currentTarget.dataset.id;
    request({ url: '/dishes/' + id + '/favorite', method: 'DELETE' })
      .then(function () {
        this.loadList(true);
      }.bind(this))
      .catch(function (err) { toastError(err); });
  }
});
