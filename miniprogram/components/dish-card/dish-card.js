'use strict';

/**
 * 菜品卡片（对齐原型 dish-card）
 * - emoji 色块图 / 名称 / 描述 / 评分 / 价格 / 加购或加减
 * - 点击卡片触发 tap 事件（detail: { dish }）
 * - 数量变化触发 qtychange 事件（detail: { id, value }）
 *   注：商品未加购时展示单独 + 按钮；加购后内嵌 qty-stepper
 */
const util = require('../../utils/util');

Component({
  properties: {
    dish: { type: Object, value: null },
    quantity: { type: Number, value: 0 },
    joinedCount: { type: Number, value: 0 } // 团队多人：已有 N 人点了这道菜
  },

  data: {
    priceText: '0.00'
  },

  observers: {
    dish: function (dish) {
      if (dish && dish.price != null) {
        this.setData({ priceText: util.formatPrice(dish.price) });
      }
    }
  },

  methods: {
    noop: function () {
      /* 拦截冒泡用 */
    },
    onTap: function () {
      this.triggerEvent('tap', { dish: this.data.dish });
    },
    onPlus: function () {
      this.triggerEvent('qtychange', { id: this.data.dish.id, value: (this.data.quantity || 0) + 1 });
    },
    onQtyChange: function (e) {
      this.triggerEvent('qtychange', { id: this.data.dish.id, value: e.detail.value });
    }
  }
});