'use strict';

/**
 * 厨房菜篮页（四期：厨房管理）
 * - 菜篮待购项：勾选完成 / 取消勾选（PUT /basket/{id}）、增（POST）、删（DELETE）
 */

const { request, toastError } = require('../../utils/request');

Page({
  data: {
    items: [],
    addName: '',
    addQuantity: '',
    loading: true,
    refreshing: false
  },

  onShow: function () {
    this.loadList();
  },

  loadList: function () {
    this.setData({ loading: true });
    request({ url: '/basket', method: 'GET' })
      .then(function (res) {
        const items = res || [];
        this.setData({
          items: items,
          checkedCount: items.filter(function (i) { return i.checked; }).length,
          loading: false,
          refreshing: false
        });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false, refreshing: false });
      }.bind(this));
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    this.loadList();
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
      wx.showToast({ title: '请输入待购名称', icon: 'none' });
      return;
    }
    request({
      url: '/basket',
      method: 'POST',
      data: { name: name, quantity: this.data.addQuantity }
    }).then(function () {
      this.setData({ addName: '', addQuantity: '' });
      this.loadList();
    }.bind(this)).catch(function (err) {
      toastError(err);
    });
  },

  onCheck: function (e) {
    const id = e.currentTarget.dataset.id;
    const checked = !e.currentTarget.dataset.checked;
    request({
      url: '/basket/' + id,
      method: 'PUT',
      data: { checked: checked }
    }).then(function () {
      this.loadList();
    }.bind(this)).catch(function (err) {
      toastError(err);
    });
  },

  onDelete: function (e) {
    const id = e.currentTarget.dataset.id;
    request({ url: '/basket/' + id, method: 'DELETE' })
      .then(function () {
        this.loadList();
      }.bind(this))
      .catch(function (err) { toastError(err); });
  }
});
