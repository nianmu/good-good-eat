'use strict';

/**
 * 好大一颗菜 · 小程序入口
 * - globalData 与 utils/store 保持一致（store 为数据源，globalData 供快速读取）
 * - onLaunch：从本地存储恢复登录态；无 token 且非 mock 模式时自动走游客登录 POST /auth/guest
 *   （mock 模式下由 utils/mock.js 的数据层在首次鉴权请求时惰性完成游客登录）
 */
const store = require('./utils/store');
const config = require('./utils/config');
const request = require('./utils/request');

App({
  globalData: {
    user: null,
    token: '',
    cart: {}
  },

  onLaunch() {
    this.globalData.user = store.get('user');
    this.globalData.token = store.get('token') || '';
    this.globalData.cart = store.get('cart') || {};

    if (!this.globalData.token && !config.useMock) {
      // 联调模式：后端未登录时自动注册/登录游客账号（昵称由后端约定生成）
      request.login().catch(function () {
        // 登录失败不阻塞首屏，页面会在具体请求时处理错误态
      });
    }
  }
});