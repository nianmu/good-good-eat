'use strict';

/**
 * 订单详情页（对齐原型 order-detail.html）
 * - 绿色取餐码大字卡片 + 五步状态步骤条（完成/当前态高亮）
 * - 信息行（团队/点餐人/下单时间）+ 菜品清单 + 合计
 * - 复制订单信息（wx.setClipboardData 组纯文本）
 * - 主按钮按状态推进调用对应 API：
 *   pending → accept（发送给厨师）
 *   accepted → status cooking（开始制作）
 *   cooking → status ready（完成制作）
 *   ready → status completed（确认取餐）
 *   completed → 再次点菜（回菜谱页）
 * - 支持 onLoad 参数 id
 */

const { request, toastError } = require('../../utils/request');
const util = require('../../utils/util');

const FLOW = ['pending', 'accepted', 'cooking', 'ready', 'completed'];
const LABELS = {
  pending: '待接单',
  accepted: '已接单',
  cooking: '制作中',
  ready: '待取餐',
  completed: '已完成'
};

const ACTIONS = {
  pending: { label: '发送给厨师', toast: '已发送给厨师，等待接单' },
  accepted: { label: '开始制作', toast: '已开始制作' },
  cooking: { label: '完成制作', toast: '已完成制作，可凭码取餐' },
  ready: { label: '确认取餐', toast: '取餐成功，祝用餐愉快！' },
  completed: { label: '再次点菜', toast: '' }
};

Page({
  data: {
    order: null,
    steps: [],
    actionLabel: '',
    canClaim: false,
    loading: true,
    submitting: false
  },

  onLoad: function (options) {
    this.orderId = options.id;
    this.loadOrder();
  },

  loadOrder: function () {
    if (!this.orderId) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    request({ url: '/orders/' + this.orderId, method: 'GET' })
      .then(function (order) {
        this.setData({
          order: this.normalizeOrder(order),
          steps: this.buildSteps(order.status),
          actionLabel: (ACTIONS[order.status] || {}).label || '再次点菜',
          canClaim: order.status === 'pending' && !order.chef_id,
          loading: false
        });
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ loading: false });
      }.bind(this));
  },

  normalizeOrder: function (order) {
    const items = (order.items || []).map(function (i) {
      return {
        dish_id: i.dish_id,
        name: i.name,
        emoji: i.emoji,
        color: i.color,
        price: i.price,
        price_text: util.formatPrice(i.price),
        quantity: i.quantity,
        total_text: util.formatPrice((Number(i.price) || 0) * i.quantity)
      };
    });
    return Object.assign({}, order, {
      items: items,
      total_amount_text: util.formatPrice(order.total_amount)
    });
  },

  buildSteps: function (status) {
    const idx = FLOW.indexOf(status);
    return FLOW.map(function (s, i) {
      return {
        key: s,
        label: LABELS[s],
        dot: i < idx ? '✓' : String(i + 1),
        cls: i < idx
          ? 'order-stepper__step--done'
          : (i === idx ? 'order-stepper__step--current' : ''),
        lineDone: i < idx
      };
    });
  },

  // ===== 主按钮：状态推进 =====
  onPrimary: function () {
    if (this.data.submitting) return;
    const order = this.data.order;
    if (!order) return;
    const id = order.id;
    const status = order.status;

    if (status === 'completed') {
      // 再次点菜
      wx.switchTab({ url: '/pages/menu/menu' });
      return;
    }

    const action = ACTIONS[status] || {};
    let p = null;
    if (status === 'pending') {
      p = request({ url: '/orders/' + id + '/accept', method: 'POST' });
    } else if (status === 'accepted') {
      p = request({ url: '/orders/' + id + '/status', method: 'POST', data: { status: 'cooking' } });
    } else if (status === 'cooking') {
      p = request({ url: '/orders/' + id + '/status', method: 'POST', data: { status: 'ready' } });
    } else if (status === 'ready') {
      p = request({ url: '/orders/' + id + '/status', method: 'POST', data: { status: 'completed' } });
    }
    if (!p) return;

    this.setData({ submitting: true });
    p.then(function () {
      wx.showToast({ title: action.toast || '已更新', icon: 'none' });
      this.setData({ submitting: false });
      this.loadOrder();
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ submitting: false });
    }.bind(this));
  },

  // ===== 认领做菜（无固定厨师时，成员认领）=====
  onClaim: function () {
    if (this.data.submitting || !this.data.order) return;
    this.setData({ submitting: true });
    request({ url: '/orders/' + this.data.order.id + '/claim', method: 'POST' })
      .then(function () {
        wx.showToast({ title: '已认领做菜，加油！', icon: 'none' });
        this.setData({ submitting: false });
        this.loadOrder();
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ submitting: false });
      }.bind(this));
  },

  // ===== 复制订单信息 =====
  buildOrderText: function () {
    const order = this.data.order;
    if (!order) return '';
    const lines = [];
    lines.push('【好大一颗菜·取餐码】' + order.pickup_code);
    lines.push('团队：' + (order.team_name || '—'));
    lines.push('点餐人：' + (order.user_nickname || '—'));
    lines.push('下单时间：' + (order.created_at || '—'));
    lines.push('————————————');
    order.items.forEach(function (i) {
      lines.push(i.name + ' ×' + i.quantity + '  ¥' + i.total_text);
    });
    lines.push('————————————');
    lines.push('共 ' + order.total_count + ' 道 · 合计 ¥' + order.total_amount_text);
    return lines.join('\n');
  },

  onCopy: function () {
    const text = this.buildOrderText();
    if (!text) return;
    wx.setClipboardData({
      data: text,
      success: function () {
        wx.showToast({ title: '已复制订单信息，去微信群粘贴吧', icon: 'none' });
      }
    });
  },

  goOrders: function () {
    wx.switchTab({ url: '/pages/orders/orders' });
  }
});