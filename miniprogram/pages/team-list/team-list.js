'use strict';

/**
 * 团队列表页
 * - 我的团队列表（来自 /me）
 * - 创建团队（POST /teams，输入名称）
 * - 加入团队（POST /teams/join，输入邀请码）
 */

const { request, toastError } = require('../../utils/request');
const store = require('../../utils/store');

const TEAM_ICONS = ['🏠', '🍽', '🎓'];
const ROLE_LABELS = { organizer: '组织者', member: '成员' };

Page({
  data: {
    teams: [],
    createName: '',
    joinCode: '',
    loading: true,
    refreshing: false,
    submitting: false
  },

  onLoad: function () {
    this.loadTeams();
  },

  onShow: function () {
    if (this._loaded) this.loadTeams();
    this._loaded = true;
  },

  loadTeams: function () {
    this.setData({ loading: true });
    request({ url: '/me', method: 'GET' })
      .then(function (res) {
        const user = res.user;
        store.set('user', user);
        const teams = (user.teams || []).map(function (t, idx) {
          return {
            id: t.id,
            name: t.name,
            icon: t.icon || TEAM_ICONS[idx % TEAM_ICONS.length],
            role_label: ROLE_LABELS[t.role] || '成员',
            member_count: t.member_count || 0,
            chef: t.chef || null,
            invite_code: t.invite_code || ''
          };
        });
        this.setData({ teams: teams, loading: false, refreshing: false });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false, refreshing: false });
      }.bind(this));
  },

  // ===== 创建团队 =====
  onCreateInput: function (e) {
    this.setData({ createName: e.detail.value });
  },

  onCreate: function () {
    if (this.data.submitting) return;
    const name = (this.data.createName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入团队名称', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    request({ url: '/teams', method: 'POST', data: { name: name } })
      .then(function (team) {
        this.setData({ createName: '', submitting: false });
        wx.showToast({ title: '创建成功，邀请码 ' + team.invite_code, icon: 'none' });
        this.loadTeams();
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ submitting: false });
      }.bind(this));
  },

  // ===== 加入团队 =====
  onJoinInput: function (e) {
    this.setData({ joinCode: e.detail.value });
  },

  onJoin: function () {
    if (this.data.submitting) return;
    const code = (this.data.joinCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    request({ url: '/teams/join', method: 'POST', data: { invite_code: code } })
      .then(function (team) {
        this.setData({ joinCode: '', submitting: false });
        wx.showToast({ title: '已加入「' + team.name + '」', icon: 'none' });
        this.loadTeams();
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ submitting: false });
      }.bind(this));
  },

  onTeamTap: function (e) {
    wx.navigateTo({ url: '/pages/team-detail/team-detail?id=' + e.currentTarget.dataset.id });
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    this.loadTeams();
  }
});