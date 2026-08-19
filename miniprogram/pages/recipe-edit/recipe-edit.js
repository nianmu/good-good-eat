'use strict';

/**
 * 新建 / 编辑菜谱页（四期：菜谱库）
 * - 字段：名称 / emoji / 色块 / 描述 / 食材(逗号分隔→数组) / 步骤(多行→数组) / 耗时 / 难度
 * - 新建 POST /recipes；编辑 PUT /recipes/{id}
 */

const { request, toastError } = require('../../utils/request');

const EMOJI_OPTIONS = ['🍖', '🥩', '🐟', '🍗', '🥦', '🍆', '🥚', '🍅', '🌽', '🍚', '🍜', '🥗', '🍲', '🥘', '🍳'];
const COLOR_OPTIONS = ['#FFAB91', '#FFCC80', '#EF9A9A', '#90CAF9', '#A5D6A7', '#B39DDB', '#FFF59D', '#FFE082'];
const DIFFICULTY_OPTIONS = ['简单', '中等', '较难'];

Page({
  data: {
    id: null,
    form: {
      name: '',
      emoji: '🍽',
      color: '#FFAB91',
      description: '',
      ingredientsText: '',
      stepsText: '',
      cookTime: '',
      difficulty: ''
    },
    emojiOptions: EMOJI_OPTIONS,
    colorOptions: COLOR_OPTIONS,
    difficultyOptions: DIFFICULTY_OPTIONS,
    saving: false
  },

  onLoad: function (options) {
    const id = options.id;
    this.setData({ id: id || null });
    if (id) {
      wx.setNavigationBarTitle({ title: '编辑菜谱' });
      this.loadDetail(id);
    } else {
      wx.setNavigationBarTitle({ title: '新建菜谱' });
    }
  },

  loadDetail: function (id) {
    request({ url: '/recipes/' + id, method: 'GET' })
      .then(function (r) {
        this.setData({
          form: {
            name: r.name || '',
            emoji: r.emoji || '🍽',
            color: r.color || '#FFAB91',
            description: r.description || '',
            ingredientsText: (r.ingredients || []).join('，'),
            stepsText: (r.steps || []).join('\n'),
            cookTime: r.cook_time ? String(r.cook_time) : '',
            difficulty: r.difficulty || ''
          }
        });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 800);
      });
  },

  onInput: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onPickEmoji: function (e) {
    this.setData({ 'form.emoji': e.currentTarget.dataset.value });
  },

  onPickColor: function (e) {
    this.setData({ 'form.color': e.currentTarget.dataset.value });
  },

  onPickDifficulty: function (e) {
    this.setData({ 'form.difficulty': e.currentTarget.dataset.value });
  },

  buildPayload: function () {
    const f = this.data.form;
    const ingredients = (f.ingredientsText || '')
      .split(/[，,、\n]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    const steps = (f.stepsText || '')
      .split('\n')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    const cookTime = f.cookTime ? parseInt(f.cookTime, 10) : null;
    return {
      name: f.name,
      emoji: f.emoji,
      color: f.color,
      description: f.description,
      ingredients: ingredients,
      steps: steps,
      cook_time: cookTime && cookTime > 0 ? cookTime : null,
      difficulty: f.difficulty || null
    };
  },

  onSave: function () {
    const payload = this.buildPayload();
    if (!payload.name.trim()) {
      wx.showToast({ title: '请填写菜谱名称', icon: 'none' });
      return;
    }
    if (!payload.ingredients.length) {
      wx.showToast({ title: '请填写至少一种食材', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    const opts = {
      url: this.data.id ? '/recipes/' + this.data.id : '/recipes',
      method: this.data.id ? 'PUT' : 'POST',
      data: payload
    };
    request(opts)
      .then(function () {
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(function () {
          wx.navigateBack({ delta: 1 });
        }, 600);
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ saving: false });
      }.bind(this));
  }
});
