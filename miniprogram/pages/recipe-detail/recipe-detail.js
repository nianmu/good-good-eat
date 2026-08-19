'use strict';

/**
 * 菜谱详情页（四期：菜谱库）
 * - 详情：食材清单 / 步骤列表分步展示 / 耗时 / 难度
 * - 本人：编辑 / 删除按钮
 */

const { request, toastError } = require('../../utils/request');
const store = require('../../utils/store');

Page({
  data: {
    id: null,
    recipe: null,
    isOwner: false,
    loading: true,
    ingredientsText: ''
  },

  onLoad: function (options) {
    this.setData({ id: options.id });
    this.loadDetail();
  },

  loadDetail: function () {
    this.setData({ loading: true });
    request({ url: '/recipes/' + this.data.id, method: 'GET' })
      .then(function (r) {
        const user = store.get('user');
        const isOwner = user && String(user.id) === String(r.user_id);
        this.setData({
          recipe: r,
          isOwner: isOwner,
          ingredientsText: (r.ingredients || []).join('、'),
          loading: false
        });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false });
      }.bind(this));
  },

  onEdit: function () {
    wx.navigateTo({ url: '/pages/recipe-edit/recipe-edit?id=' + this.data.id });
  },

  onDelete: function () {
    const self = this;
    wx.showModal({
      title: '删除菜谱',
      content: '确定要删除「' + (this.data.recipe.name || '') + '」吗？',
      confirmColor: '#F44336',
      success: function (res) {
        if (!res.confirm) return;
        request({ url: '/recipes/' + self.data.id, method: 'DELETE' })
          .then(function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 600);
          })
          .catch(function (err) { toastError(err); });
      }
    });
  }
});
