'use strict';

/**
 * TabBar 消息角标（未读数）
 * ----------------------------------------
 * - 角标数据以 store.unreadCount 为准（避免每次切 tab 都发请求）
 * - refreshUnread(force)：force=true 时拉一次 GET /messages 刷新未读数
 *   （消息页 onShow 使用）；其他 tab onShow 仅 applyBadge 按缓存展示
 * - 若平台不支持 tabBar 角标（canIUse 失败），静默降级为不显示
 */

const store = require('./store');
const { request } = require('./request');

const TAB_INDEX = 2; // tabBar.list 中「消息」的下标

function applyBadge() {
  if (!wx.canIUse('tabBar.setTabBarBadge')) return;
  const n = Number(store.get('unreadCount')) || 0;
  try {
    if (n > 0) {
      wx.setTabBarBadge({ index: TAB_INDEX, text: n > 99 ? '99+' : String(n) });
    } else {
      wx.removeTabBarBadge({ index: TAB_INDEX, fail: function () {} });
    }
  } catch (e) { /* 未初始化时可能抛异常，忽略 */ }
}

/** 拉取最新未读数并更新角标；force=false 且有缓存时直接返回 */
function refreshUnread(force) {
  applyBadge();
  if (force === false && store.get('unreadCount') != null) {
    return Promise.resolve();
  }
  return request({ url: '/messages?page=1&page_size=1', method: 'GET' })
    .then(function (res) {
      store.set('unreadCount', res.unread_count || 0);
      applyBadge();
    })
    .catch(function () { /* 拉取失败保持缓存角标 */ });
}

module.exports = {
  applyBadge: applyBadge,
  refreshUnread: refreshUnread
};