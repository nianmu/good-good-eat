'use strict';

/**
 * 订单状态徽章
 * 颜色对齐原型 orderStatusMap（prototype/scripts/data/orders.js）：
 *   pending 橙 / accepted 蓝 / cooking 橙 / ready 绿 / completed 灰
 */
const STATUS_MAP = {
  pending: { label: '待接单', color: '#FF9800', bgColor: '#FFF3E0' },
  accepted: { label: '已接单', color: '#2196F3', bgColor: '#E3F2FD' },
  cooking: { label: '制作中', color: '#FF9800', bgColor: '#FFF3E0' },
  ready: { label: '待取餐', color: '#4CAF50', bgColor: '#E8F5E9' },
  completed: { label: '已完成', color: '#666666', bgColor: '#F5F5F5' }
};

Component({
  properties: {
    status: { type: String, value: 'pending' }
  },

  data: {
    label: '待接单',
    color: '#FF9800',
    bgColor: '#FFF3E0'
  },

  observers: {
    status: function (status) {
      const m = STATUS_MAP[status] || { label: status || '未知', color: '#666666', bgColor: '#F5F5F5' };
      this.setData({ label: m.label, color: m.color, bgColor: m.bgColor });
    }
  }
});