'use strict';

/**
 * 数量步进器：减 / 数量 / 加
 * 事件：change → { value }（数量变化；达到下限时再减不触发）
 */
Component({
  properties: {
    value: { type: Number, value: 0 },
    min: { type: Number, value: 0 },
    max: { type: Number, value: 99 }
  },

  methods: {
    onMinus: function () {
      if (this.data.value > this.data.min) {
        this.triggerEvent('change', { value: this.data.value - 1 });
      }
    },
    onPlus: function () {
      if (this.data.value < this.data.max) {
        this.triggerEvent('change', { value: this.data.value + 1 });
      }
    }
  }
});