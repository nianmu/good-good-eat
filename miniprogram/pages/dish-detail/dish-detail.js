'use strict';

/**
 * 菜品详情页
 * - 大图（emoji 色块）/ 食材 / 做法简述 / 评分 / 价格 / 数量选择
 * - 加入购物车：回写 store 并 toast 后返回上一页
 */

const store = require('../../utils/store');
const { request, toastError } = require('../../utils/request');
const util = require('../../utils/util');

Page({
  data: {
    dish: null,
    qty: 1,
    priceText: '0.00',
    loading: true
  },

  onLoad: function (options) {
    this.dishId = options.id;
    this.loadDish();
  },

  loadDish: function () {
    if (!this.dishId) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    request({ url: '/dishes/' + this.dishId, method: 'GET' })
      .then(function (dish) {
        this.setData({
          dish: dish,
          priceText: util.formatPrice(dish.price),
          ingredientsText: (dish.ingredients || []).join('、'),
          loading: false
        });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false });
      }.bind(this));
  },

  onQtyChange: function (e) {
    this.setData({ qty: Math.max(1, e.detail.value) });
  },

  onAddToCart: function () {
    if (!this.data.dish) return;
    store.addToCart(this.data.dish.id, this.data.qty);
    wx.showToast({ title: '已加入购物车', icon: 'success' });
    setTimeout(function () {
      wx.navigateBack({ delta: 1 });
    }, 600);
  }
});