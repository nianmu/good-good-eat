'use strict';

/**
 * 菜谱页（TabBar·菜谱）
 * - 左侧分类 + 右侧菜品（同原型布局）
 * - 搜索框本地过滤（名称/描述/食材）
 * - 随机点菜（随机 3 道加入购物车）/ 邀请下单（占位 toast）/ 下单（跳购物车）
 * - 加菜数量实时同步 store（跨页面共享，角标实时更新）
 */

const store = require('../../utils/store');
const { request, toastError } = require('../../utils/request');
const util = require('../../utils/util');
const ws = require('../../utils/ws');

Page({
  data: {
    user: { avatar: '👤', nickname: '好大一颗菜' },
    teams: [],
    currentTeamId: '',
    currentTeamName: '',
    categories: [],
    activeCategoryId: '',
    activeCategoryName: '',
    allDishes: [],
    dishes: [],
    keyword: '',
    cart: {},
    cartCount: 0,
    favoritedMap: {}, // dish_id -> true（四期收藏）
    loading: true,
    refreshing: false,
    // 五期：随机 / 推荐
    randomLoading: false,
    recommendVisible: false,
    recommendLoading: false,
    recommend: null, // { plan:[dish], reason }
    peopleText: '3',
    // 多人实时（三期）
    roomStatus: 'closed',
    roomStatusLabel: '未连接',
    joinedCount: {} // dish_id -> 已点人数（团队房间）
  },

  onLoad: function () {
    this._onStore = store.on(this._handleStoreChange.bind(this));
    this.loadUser();
    this.loadData();
  },

  onShow: function () {
    this.syncCart();
    this.joinRoom();
    this.loadFavorites();
  },

  onHide: function () {
    // 保持房间连接（切页回来继续实时）；onUnload 时彻底清理
  },

  onUnload: function () {
    store.off(this._onStore);
    this.leaveRoom();
  },

  _handleStoreChange: function (key) {
    if (key === 'cart') this.syncCart();
    if (key === 'user') {
      const user = store.get('user');
      if (user) this.setData({ user: user });
    }
  },

  // ===== 数据加载 =====
  loadUser: function () {
    const user = store.get('user');
    if (user) {
      this.setData({ user: user });
      this.syncCurrentTeam(user);
    }
    request({ url: '/me', method: 'GET' })
      .then(function (res) {
        store.set('user', res.user);
        const u = res.user;
        this.setData({ user: u });
        this.syncCurrentTeam(u);
      }.bind(this))
      .catch(function () {
        /* 未登录时保持占位，不阻塞点菜 */
      });
  },

  syncCurrentTeam: function (user) {
    const teams = (user && user.teams) || [];
    const storedId = store.get('currentTeamId');
    let cur = teams.find(function (t) { return t.id === storedId; }) || teams[0] || null;
    if (cur && cur.id !== storedId) store.set('currentTeamId', cur.id);
    this.setData({
      teams: teams,
      currentTeamId: cur ? cur.id : '',
      currentTeamName: cur ? cur.name : ''
    });
  },

  loadData: function () {
    this.setData({ loading: true });
    Promise.all([
      request({ url: '/categories', method: 'GET' }),
      request({ url: '/dishes', method: 'GET' })
    ]).then(function (res) {
      const categories = res[0];
      const allDishes = res[1].items || [];
      categories.forEach(function (c) {
        c.count = allDishes.filter(function (d) { return d.category_id === c.id; }).length;
      });
      const first = categories[0] || null;
      this.setData({
        categories: categories,
        allDishes: allDishes,
        activeCategoryId: first ? first.id : '',
        loading: false
      });
      this.applyFilter();
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ loading: false });
    }.bind(this));
  },

  // ===== 收藏（四期）=====
  loadFavorites: function () {
    request({ url: '/favorites', method: 'GET', data: { page: 1, page_size: 100 } })
      .then(function (res) {
        const map = {};
        (res.items || []).forEach(function (d) {
          map[d.id] = true;
        });
        this.setData({ favoritedMap: map });
      }.bind(this))
      .catch(function () { /* 收藏加载失败不阻塞浏览 */ });
  },

  onFavorite: function (e) {
    const id = e.detail.id;
    const cur = !!this.data.favoritedMap[id];
    const next = !cur;
    request({
      url: '/dishes/' + id + '/favorite',
      method: cur ? 'DELETE' : 'POST'
    }).then(function () {
      const map = Object.assign({}, this.data.favoritedMap);
      if (next) map[id] = true; else delete map[id];
      this.setData({ favoritedMap: map });
      if (cur) {
        wx.showToast({ title: '已取消收藏', icon: 'none' });
      }
    }.bind(this)).catch(function (err) {
      toastError(err);
    });
  },

  // ===== 本地过滤 =====
  applyFilter: function () {
    const kw = (this.data.keyword || '').trim();
    const catId = this.data.activeCategoryId;
    let list = this.data.allDishes;
    let title = '';
    const cat = this.data.categories.find(function (c) { return c.id === catId; });

    if (kw) {
      list = list.filter(function (d) {
        return (d.name || '').indexOf(kw) >= 0 ||
          (d.description || '').indexOf(kw) >= 0 ||
          (d.ingredients || []).some(function (i) { return i.indexOf(kw) >= 0; });
      });
      title = '搜索「' + kw + '」';
    } else {
      if (catId) list = list.filter(function (d) { return d.category_id === catId; });
      title = cat ? cat.name : '全部菜品';
    }

    this.setData({
      dishes: list,
      activeCategoryName: title,
      dishesTitle: title + '（' + list.length + '）'
    });
  },

  // ===== 购物车同步 =====
  syncCart: function () {
    const cart = store.get('cart') || {};
    let count = 0;
    Object.keys(cart).forEach(function (k) { count += cart[k] || 0; });
    this.setData({ cart: cart, cartCount: count });
  },

  // ===== 团队房间（三期·多人实时）=====
  joinRoom: function () {
    const teamId = this.data.currentTeamId;
    if (!teamId) return;
    if (this._roomTeamId === teamId && this._wsBound) {
      ws.connect(teamId); // 已连则补 join 拉快照
      return;
    }
    this._roomTeamId = teamId;
    if (!this._wsBound) {
      this._wsBound = true;
      ws.on('cart.snapshot', this._onCartSnapshot.bind(this));
      ws.on('cart.upsert', this._onCartUpsert.bind(this));
      ws.on('member.joined', this._onMemberJoined.bind(this));
      ws.on('order.created', this._onOrderCreated.bind(this));
      ws.on('order.status_changed', this._onOrderStatusChanged.bind(this));
      ws.onConnectionChange(this._onConnChange.bind(this));
    }
    ws.connect(teamId);
  },

  leaveRoom: function () {
    if (this._wsBound) {
      this._wsBound = false;
      ws.close();
    }
    this._roomTeamId = null;
  },

  _onConnChange: function (s) {
    const label = ws.statusLabel(s.status);
    this.setData({ roomStatus: s.status, roomStatusLabel: label });
  },

  _onCartSnapshot: function (data) {
    const joined = {};
    (data.items || []).forEach(function (it) {
      joined[it.dish_id] = (it.user_ids || []).length;
    });
    this.setData({ joinedCount: joined });
  },

  _onCartUpsert: function (data) {
    const joined = Object.assign({}, this.data.joinedCount);
    if (data.user_ids) {
      joined[data.dish_id] = data.user_ids.length;
    } else {
      joined[data.dish_id] = (joined[data.dish_id] || 0) + (data.action === 'minus' ? -1 : 1);
      if (joined[data.dish_id] < 0) joined[data.dish_id] = 0;
    }
    this.setData({ joinedCount: joined });
  },

  _onMemberJoined: function (data) {
    if (data.nickname) {
      wx.showToast({ title: data.nickname + ' 加入了点餐', icon: 'none' });
    }
  },

  _onOrderCreated: function (data) {
    if (data.pickup_code) {
      wx.showToast({ title: '新订单 取餐码 ' + data.pickup_code, icon: 'none' });
    }
  },

  _onOrderStatusChanged: function (data) {
    const label = { accepted: '已接单', cooking: '制作中', ready: '待取餐', completed: '已完成' }[data.status] || data.status;
    wx.showToast({ title: '订单状态：' + label, icon: 'none' });
  },

  /** 本地加减菜 → store + 广播给团队房间 */
  _broadcastQty: function (dishId, newValue, oldValue) {
    if (!this.data.currentTeamId) return;
    const action = newValue > (oldValue || 0) ? 'plus' : 'minus';
    ws.send({
      event: 'cart.upsert',
      data: { dish_id: dishId, quantity: newValue, action: action }
    });
  },

  onQtyChange: function (e) {
    const id = e.detail.id;
    const newValue = e.detail.value;
    const oldValue = (this.data.cart && this.data.cart[id]) || 0;
    store.setCartQuantity(id, newValue);
    this._broadcastQty(id, newValue, oldValue);
  },

  // ===== 交互 =====
  onCategoryTap: function (e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.activeCategoryId) return;
    this.setData({ activeCategoryId: id });
    this.applyFilter();
  },

  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  onDishTap: function (e) {
    const dish = e.detail.dish;
    if (dish) {
      wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + dish.id });
    }
  },

  /** 加购一组菜品（随机/推荐共用）：更新 store + 广播团队房间 */
  _addToCart: function (dishes, delta) {
    const cart = Object.assign({}, store.get('cart') || {});
    dishes.forEach(function (d) {
      cart[d.id] = (cart[d.id] || 0) + (delta || 1);
    });
    store.set('cart', cart);
    const self = this;
    dishes.forEach(function (d) {
      ws.send({ event: 'cart.upsert', data: { dish_id: d.id, quantity: cart[d.id], action: 'plus' } });
    });
    this.syncCart();
  },

  /** 五期：随机点菜（均衡）——调后端 GET /dishes/random?type=balanced */
  onRandom: function () {
    if (this.data.randomLoading) return;
    this.setData({ randomLoading: true });
    request({
      url: '/dishes/random',
      method: 'GET',
      data: { n: 3, type: 'balanced' }
    }).then(function (res) {
      const picks = res || [];
      if (!picks.length) {
        wx.showToast({ title: '暂无可推荐的菜品', icon: 'none' });
        this.setData({ randomLoading: false });
        return;
      }
      this._addToCart(picks, 1);
      wx.showToast({
        title: '推荐：' + picks.map(function (d) { return d.name; }).join('、'),
        icon: 'none'
      });
      this.setData({ randomLoading: false });
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ randomLoading: false });
    }.bind(this));
  },

  /** 五期：惊喜推荐——调 GET /dishes/random?type=surprise */
  onSurprise: function () {
    if (this.data.randomLoading) return;
    this.setData({ randomLoading: true });
    request({
      url: '/dishes/random',
      method: 'GET',
      data: { n: 3, type: 'surprise' }
    }).then(function (res) {
      const picks = res || [];
      if (!picks.length) {
        wx.showToast({ title: '暂无可推荐的菜品', icon: 'none' });
        this.setData({ randomLoading: false });
        return;
      }
      this._addToCart(picks, 1);
      wx.showToast({
        title: '惊喜：' + picks.map(function (d) { return d.name; }).join('、'),
        icon: 'none'
      });
      this.setData({ randomLoading: false });
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ randomLoading: false });
    }.bind(this));
  },

  // ===== 五期：今天吃什么（按人数推荐弹层）=====
  onRecommendOpen: function () {
    this.setData({ recommendVisible: true, peopleText: '3' });
  },

  onRecommendClose: function () {
    if (this.data.recommendLoading) return;
    this.setData({ recommendVisible: false, recommend: null });
  },

  onPeopleInput: function (e) {
    this.setData({ peopleText: e.detail.value });
  },

  onRecommendLoad: function () {
    const people = parseInt(this.data.peopleText, 10) || 3;
    this.setData({ recommendLoading: true, recommend: null });
    request({
      url: '/dishes/recommend',
      method: 'GET',
      data: { people: Math.max(1, Math.min(20, people)) }
    }).then(function (res) {
      this.setData({ recommend: res });
      this.setData({ recommendLoading: false });
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ recommendLoading: false });
    }.bind(this));
  },

  /** 将推荐组合加入购物车 */
  onRecommendAddAll: function () {
    const plan = (this.data.recommend && this.data.recommend.plan) || [];
    if (!plan.length) return;
    this._addToCart(plan, 1);
    this.setData({ recommendVisible: false, recommend: null });
    wx.showToast({
      title: '已加入购物车：' + plan.map(function (d) { return d.name; }).join('、'),
      icon: 'none'
    });
  },

  /** 将推荐组合保存为饮食计划 */
  onRecommendSavePlan: function () {
    const plan = (this.data.recommend && this.data.recommend.plan) || [];
    if (!plan.length) return;
    wx.navigateTo({
      url: '/pages/plan-edit/plan-edit?from=recommend&people=' +
        encodeURIComponent(this.data.peopleText || '3')
    });
    this.setData({ recommendVisible: false, recommend: null });
  },

  onInvite: function () {
    wx.showToast({ title: '邀请链接即将上线，敬请期待', icon: 'none' });
  },

  onSubmit: function () {
    if (!this.data.cartCount) {
      wx.showToast({ title: '购物车是空的，先点几道菜吧', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/cart/cart' });
  },

  onCartTap: function () {
    wx.navigateTo({ url: '/pages/cart/cart' });
  },

  noop: function () {},

  onTeamTap: function () {
    wx.navigateTo({ url: '/pages/team-list/team-list' });
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    Promise.all([
      request({ url: '/categories', method: 'GET' }),
      request({ url: '/dishes', method: 'GET' })
    ]).then(function (res) {
      const categories = res[0];
      const allDishes = res[1].items || [];
      this.setData({ categories: categories, allDishes: allDishes, refreshing: false });
      this.loadUser();
      this.applyFilter();
      wx.showToast({ title: '已刷新', icon: 'none' });
    }.bind(this)).catch(function (err) {
      toastError(err);
      this.setData({ refreshing: false });
    }.bind(this));
  }
});