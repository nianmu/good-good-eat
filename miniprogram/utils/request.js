'use strict';

/**
 * 网络请求封装（Promise）
 * ----------------------------------------
 * - 统一拼接 baseUrl（utils/config.js）
 * - 自动注入 Authorization: Bearer <token>
 * - 401 时自动重新游客登录并重试一次（联调模式）
 * - 统一解包 {code, message, data}：code===0 且 HTTP 2xx 时 resolve(data)，
 *   否则 reject(Error(message))；网络失败 reject 并 toast（Error.toasted = true）
 * - useMock=true 时走 utils/mock.js 数据层（结构契约与真实后端一致）
 */

const config = require('./config');
const store = require('./store');
const util = require('./util');
const mock = require('./mock');

/** 统一错误 toast（页面 catch 里调用；网络错误已 toast 过则自动跳过） */
function toastError(err) {
  const msg = ((err && err.message) || '请求失败，请稍后重试').toString();
  if (err && err.toasted) return;
  wx.showToast({ title: msg.length > 20 ? msg.slice(0, 20) + '…' : msg, icon: 'none' });
}

/**
 * 游客登录（两种模式统一入口）
 * 成功后将 token/user 写入 store；返回 {token, user}
 */
function login(data) {
  // 游客身份持久化：昵称只生成一次并存入本地存储，
  // 避免每次启动换新昵称导致后端新建账号、历史团队/订单"消失"
  let nickname = data && data.nickname;
  if (!nickname) {
    nickname = wx.getStorageSync('ggc:guest_nick') || ('游客-' + util.randomCode(4));
    wx.setStorageSync('ggc:guest_nick', nickname);
  }
  return request({
    url: '/auth/guest',
    method: 'POST',
    data: data || { nickname: nickname }
  }).then(function (res) {
    if (res && res.token) {
      store.set('token', res.token);
      if (res.user) store.set('user', res.user);
    }
    return res;
  });
}

function request(options) {
  options = options || {};

  // —— mock 模式：交给数据层，行为契约与真实请求一致 ——
  if (config.useMock) {
    return mock.request(options);
  }

  // —— 联调模式：真实 wx.request ——
  return new Promise(function (resolve, reject) {
    // 注意：必须带 charset=utf-8 —— Windows 版微信开发者工具对不带 charset 的
    // application/json 会把请求体按系统本地代码页（GBK）编码，导致中文乱码
    const header = { 'Content-Type': 'application/json; charset=utf-8' };
    const token = store.get('token');
    if (token && options.auth !== false) header.Authorization = 'Bearer ' + token;

    wx.request({
      url: config.baseUrl + (options.url || ''),
      method: options.method || 'GET',
      data: options.data || {},
      header: header,
      success: function (res) {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 0) {
          resolve(body.data);
          return;
        }
        if (res.statusCode === 401 && !options._retried && options.auth !== false) {
          // 令牌失效：自动重新游客登录后重试一次
          login()
            .then(function () {
              return request(Object.assign({}, options, { _retried: true }));
            })
            .then(resolve, reject);
          return;
        }
        const err = new Error(body.message || ('请求失败（' + res.statusCode + '）'));
        err.code = body.code != null ? body.code : res.statusCode;
        reject(err);
      },
      fail: function () {
        const err = new Error('网络异常，请检查网络后重试');
        err.toasted = true;
        wx.showToast({ title: err.message, icon: 'none' });
        reject(err);
      }
    });
  });
}

module.exports = {
  request: request,
  login: login,
  toastError: toastError
};