'use strict';

/**
 * 轻量全局状态
 * ----------------------------------------
 * 状态：{ user, token, cart: { dishId: quantity }, currentTeamId }
 * - get/set 读写并自动持久化到 wx storage（刷新不丢）
 * - on/off 变更通知（subscribe，key 变化时回调 fn(key, value, state)）
 * - 购物车常用操作封装，变更即通知（页面据此实时刷新角标/列表）
 */

const STORAGE_KEY = 'ggc:app-store';

let state = null;
let listeners = [];

function load() {
  if (state) return;
  state = { user: null, token: '', cart: {}, currentTeamId: '' };
  try {
    const saved = wx.getStorageSync(STORAGE_KEY);
    if (saved && typeof saved === 'object') {
      state = Object.assign({}, state, saved);
      if (!state.cart || typeof state.cart !== 'object') state.cart = {};
    }
  } catch (e) {
    /* 存储不可用时退化为内存态 */
  }
}

function persist() {
  try {
    wx.setStorageSync(STORAGE_KEY, state);
  } catch (e) {
    /* 忽略存储失败 */
  }
}

function notify(key, value) {
  for (let i = 0; i < listeners.length; i++) {
    try {
      listeners[i](key, value, state);
    } catch (e) {
      /* 单个监听器异常不影响其他监听器 */
    }
  }
}

module.exports = {
  get: function (key) {
    load();
    return state[key];
  },

  set: function (key, value) {
    load();
    state[key] = value;
    persist();
    notify(key, value);
    return value;
  },

  /** 订阅变更：fn(key, value, state)；返回 fn 本身便于 off */
  on: function (fn) {
    if (listeners.indexOf(fn) < 0) listeners.push(fn);
    return fn;
  },

  off: function (fn) {
    listeners = listeners.filter(function (x) { return x !== fn; });
  },

  // ===== 购物车 =====
  getCart: function () {
    load();
    return state.cart;
  },

  /** 设置某菜品数量；quantity<=0 表示移除 */
  setCartQuantity: function (dishId, quantity) {
    load();
    const cart = Object.assign({}, state.cart);
    if (quantity > 0) {
      cart[dishId] = quantity;
    } else {
      delete cart[dishId];
    }
    state.cart = cart;
    persist();
    notify('cart', cart);
    return cart;
  },

  /** 加购：数量累加 */
  addToCart: function (dishId, delta) {
    load();
    const cur = state.cart[dishId] || 0;
    return this.setCartQuantity(dishId, cur + (delta || 1));
  },

  removeFromCart: function (dishId) {
    return this.setCartQuantity(dishId, 0);
  },

  clearCart: function () {
    load();
    state.cart = {};
    persist();
    notify('cart', state.cart);
  },

  /** 购物车总件数（∑ quantity） */
  cartCount: function () {
    load();
    return Object.keys(state.cart).reduce(function (sum, k) {
      return sum + (state.cart[k] || 0);
    }, 0);
  }
};