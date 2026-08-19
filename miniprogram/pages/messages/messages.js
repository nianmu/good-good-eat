'use strict';

/**
 * 消息中心（TabBar·消息）
 * - 我的消息分页列表（GET /messages）+ 未读数角标
 * - 点击消息标记已读（POST /messages/{id}/read）
 * - 上拉触底加载更多
 */

const { request, toastError } = require('../../utils/request');
const store = require('../../utils/store');
const util = require('../../utils/util');
const badge = require('../../utils/badge');

Page({
  data: {
    messages: [],
    total: 0,
    unreadCount: 0,
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false
  },

  onShow: function () {
    badge.refreshUnread(true);
    this.loadMessages(true);
  },

  loadMessages: function (reset) {
    if (reset) {
      this.setData({ page: 1, loading: true });
    }
    if (!reset && (this.data.loadingMore || !this.data.hasMore)) return;
    const page = reset ? 1 : this.data.page + 1;
    this.setData({ loadingMore: !reset });
    request({ url: '/messages?page=' + page + '&page_size=15', method: 'GET' })
      .then(function (res) {
        const items = (res.items || []).map(function (m) {
          return {
            id: m.id,
            type: m.type,
            title: m.title,
            content: m.content,
            is_read: !!m.is_read,
            time_text: util.formatTime(m.created_at)
          };
        });
        this.setData({
          messages: reset ? items : this.data.messages.concat(items),
          total: res.total || 0,
          unreadCount: res.unread_count || 0,
          page: res.page || page,
          hasMore: items.length >= 15,
          loading: false,
          loadingMore: false
        });
        store.set('unreadCount', res.unread_count || 0);
        badge.applyBadge();
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false, loadingMore: false });
      }.bind(this));
  },

  onLoadMore: function () {
    this.loadMessages(false);
  },

  onMessageTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.messages.find(function (m) { return m.id === id; });
    if (!item) return;
    if (item.is_read) return;

    request({ url: '/messages/' + id + '/read', method: 'POST' })
      .then(function () {
        const messages = this.data.messages.map(function (m) {
          if (m.id === id) m.is_read = true;
          return m;
        });
        const unread = Math.max(0, this.data.unreadCount - 1);
        this.setData({ messages: messages, unreadCount: unread });
        store.set('unreadCount', unread);
        badge.applyBadge();
      }.bind(this))
      .catch(function (err) {
        toastError(err);
      }.bind(this));
  },

  goMenu: function () {
    wx.switchTab({ url: '/pages/menu/menu' });
  }
});