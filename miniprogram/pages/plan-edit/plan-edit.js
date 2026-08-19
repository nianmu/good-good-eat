'use strict';

/**
 * 新建饮食计划页（五期：饮食计划）
 * - 名称 / 备注
 * - 菜品：从「今天吃什么」推荐组合预填（from=recommend&people=N），
 *   或从全部分类手动选择加入，数量可调、可移除
 * - 保存 POST /plans
 * （编辑已存在计划不在本期后端契约内：仅 新建/查看/删除）
 */

const { request, toastError } = require('../../utils/request');

Page({
  data: {
    form: { name: '', note: '' },
    items: [], // { dish, quantity } 已选
    groups: [], // 手动选择：{ id, name, dishes:[...] }
    activeCatId: '',
    recommendReason: '',
    saving: false
  },

  onLoad: function (options) {
    wx.setNavigationBarTitle({ title: '新建饮食计划' });
    this.loadDishes();
    if (options.from === 'recommend') {
      const people = parseInt(options.people, 10) || 3;
      this.loadRecommend(people);
    }
  },

  loadDishes: function () {
    Promise.all([
      request({ url: '/categories', method: 'GET' }),
      request({ url: '/dishes', method: 'GET', data: { page_size: 100 } })
    ]).then(function (res) {
      const categories = res[0];
      const allDishes = res[1].items || [];
      const groups = categories.map(function (c) {
        return {
          id: c.id,
          name: c.name,
          dishes: allDishes.filter(function (d) { return d.category_id === c.id; })
        };
      });
      this.setData({
        groups: groups,
        activeCatId: categories.length ? categories[0].id : ''
      });
    }.bind(this)).catch(function (err) {
      toastError(err);
    }.bind(this));
  },

  loadRecommend: function (people) {
    request({
      url: '/dishes/recommend',
      method: 'GET',
      data: { people: people }
    }).then(function (res) {
      const plan = res.plan || [];
      const items = plan.map(function (d) { return { dish: d, quantity: 1 }; });
      this.setData({
        items: items,
        recommendReason: res.reason || ''
      });
      if (!this.data.form.name && plan.length) {
        this.setData({ 'form.name': '今天吃什么（' + people + '人）' });
      }
    }.bind(this)).catch(function (err) {
      toastError(err);
    }.bind(this));
  },

  onInput: function (e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onCatTap: function (e) {
    this.setData({ activeCatId: e.currentTarget.dataset.id });
  },

  onPickDish: function (e) {
    const dish = this.data.groups
      .reduce(function (acc, g) { return acc.concat(g.dishes); }, [])
      .find(function (d) { return String(d.id) === String(e.currentTarget.dataset.id); });
    if (!dish) return;
    const items = this.data.items.slice();
    const exist = items.find(function (it) { return String(it.dish.id) === String(dish.id); });
    if (exist) {
      exist.quantity += 1;
    } else {
      items.push({ dish: dish, quantity: 1 });
    }
    this.setData({ items: items });
  },

  onIncQty: function (e) {
    const idx = e.currentTarget.dataset.index;
    const items = this.data.items.slice();
    items[idx].quantity += 1;
    this.setData({ items: items });
  },

  onDecQty: function (e) {
    const idx = e.currentTarget.dataset.index;
    const items = this.data.items.slice();
    const it = items[idx];
    if (it.quantity <= 1) {
      items.splice(idx, 1);
    } else {
      it.quantity -= 1;
    }
    this.setData({ items: items });
  },

  onRemoveItem: function (e) {
    const idx = e.currentTarget.dataset.index;
    const items = this.data.items.slice();
    items.splice(idx, 1);
    this.setData({ items: items });
  },

  onSave: function () {
    const name = (this.data.form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写计划名称', icon: 'none' });
      return;
    }
    if (!this.data.items.length) {
      wx.showToast({ title: '请至少选择一道菜', icon: 'none' });
      return;
    }
    if (this.data.saving) return;
    this.setData({ saving: true });

    const payload = {
      name: name,
      note: this.data.form.note || '',
      items: this.data.items.map(function (it) {
        return { dish_id: it.dish.id, quantity: it.quantity };
      })
    };
    request({ url: '/plans', method: 'POST', data: payload })
      .then(function () {
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(function () { wx.navigateBack({ delta: 1 }); }, 600);
      }.bind(this))
      .catch(function (err) {
        toastError(err);
        this.setData({ saving: false });
      }.bind(this));
  }
});
