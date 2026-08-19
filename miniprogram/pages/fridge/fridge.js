'use strict';

/**
 * 厨房冰箱页（四期：厨房管理）
 * - 我的冰箱食材增删（POST / DELETE /fridge）
 * - 「冰箱能做的菜」推荐列表（GET /fridge/suggest，展示命中数，点进去跳菜谱/菜品详情）
 */

const { request, toastError } = require('../../utils/request');

Page({
  data: {
    items: [],
    suggest: [],
    addName: '',
    addQuantity: '',
    loading: true,
    refreshing: false
  },

  onShow: function () {
    this.loadAll();
  },

  loadAll: function () {
    this.setData({ loading: true });
    Promise.all([
      request({ url: '/fridge', method: 'GET' }),
      request({ url: '/fridge/suggest', method: 'GET' })
    ]).then(function (res) {
      this.setData({
        items: res[0] || [],
        suggest: res[1] || [],
        loading: false,
        refreshing: false
      });
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ loading: false, refreshing: false });
    }.bind(this));
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    this.loadAll();
  },

  onNameInput: function (e) {
    this.setData({ addName: e.detail.value });
  },

  onQuantityInput: function (e) {
    this.setData({ addQuantity: e.detail.value });
  },

  onAdd: function () {
    const name = (this.data.addName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入食材名称', icon: 'none' });
      return;
    }
    request({
      url: '/fridge',
      method: 'POST',
      data: { name: name, quantity: this.data.addQuantity }
    }).then(function () {
      this.setData({ addName: '', addQuantity: '' });
      this.loadAll();
    }.bind(this)).catch(function (err) {
      toastError(err);
    });
  },

  onDelete: function (e) {
    const id = e.currentTarget.dataset.id;
    request({ url: '/fridge/' + id, method: 'DELETE' })
      .then(function () {
        this.loadAll();
      }.bind(this))
      .catch(function (err) { toastError(err); });
  },

  onSuggestTap: function (e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    if (item.source === 'recipe') {
      wx.navigateTo({ url: '/pages/recipe-detail/recipe-detail?id=' + item.id });
    } else if (item.source === 'dish') {
      wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + item.id });
    }
  }
});
