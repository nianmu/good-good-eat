'use strict';

/**
 * 我的菜谱列表页（四期：菜谱库）
 * - GET /recipes?owner=me 分页加载我的菜谱
 * - 卡片：emoji 色块 / 名称 / 做法简述 / 耗时
 * - 点击进入详情，右下角 + 新建入口进 recipe-edit
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
    // 从编辑/详情返回时刷新（新增、改名、删除都反映出来）
    if (this._loaded) this.loadList(true);
  },

  loadList: function (reset) {
    if (reset) {
      this.setData({ loading: true, page: 1 });
    }
    const page = reset ? 1 : this.data.page;
    request({
      url: '/recipes',
      method: 'GET',
      data: { owner: 'me', page: page, page_size: this.data.pageSize }
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

  onRecipeTap: function (e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?id=' + id });
  },

  onCreate: function () {
    wx.navigateTo({ url: '/pages/recipe-edit/recipe-edit' });
  }
});
