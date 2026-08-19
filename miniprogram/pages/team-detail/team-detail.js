'use strict';

/**
 * 团队详情页
 * - 团队信息（名称 / 邀请码可复制 / 角色 / 厨师）
 * - 成员列表（昵称 / 头像 / 角色徽章）
 * - 指定厨师入口（占位 toast，第三期开放）
 */

const { request, toastError } = require('../../utils/request');

const ROLE_LABELS = { organizer: '组织者', member: '成员' };

Page({
  data: {
    team: null,
    members: [],
    loading: true
  },

  onLoad: function (options) {
    this.teamId = options.id;
    this.loadTeam();
  },

  loadTeam: function () {
    if (!this.teamId) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    request({ url: '/teams/' + this.teamId, method: 'GET' })
      .then(function (res) {
        const team = res.team;
        const members = (res.members || []).map(function (m) {
          return {
            id: m.id,
            nickname: m.nickname,
            avatar: m.avatar,
            role: m.role,
            role_label: ROLE_LABELS[m.role] || '成员'
          };
        });
        this.setData({
          team: team,
          members: members,
          loading: false,
          refreshing: false
        });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false, refreshing: false });
      }.bind(this));
  },

  onCopyInvite: function () {
    const code = this.data.team && this.data.team.invite_code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: '邀请码已复制，发给伙伴一起点菜吧', icon: 'none' });
      }
    });
  },

  onAssignChef: function () {
    const team = this.data.team;
    if (!team) return;
    if (team.role !== 'organizer') {
      wx.showToast({ title: '仅组织者可指定厨师', icon: 'none' });
      return;
    }
    const members = this.data.members || [];
    if (!members.length) {
      wx.showToast({ title: '暂无成员可指定', icon: 'none' });
      return;
    }
    const names = members.map(function (m) { return m.nickname; });
    const self = this;
    wx.showActionSheet({
      itemList: names,
      success: function (res) {
        const target = members[res.tapIndex];
        self.setData({ submitting: true });
        request({ url: '/teams/' + team.id + '/chef', method: 'PUT', data: { user_id: target.id } })
          .then(function () {
            wx.showToast({ title: '已指定 ' + target.nickname + ' 为厨师', icon: 'none' });
            self.setData({ submitting: false });
            self.loadTeam();
          }.bind(self))
          .catch(function (err) {
            toastError(err);
            self.setData({ submitting: false });
          }.bind(self));
      }
    });
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    this.loadTeam();
  }
});