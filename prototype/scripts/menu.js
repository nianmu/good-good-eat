/**
 * 点菜主页交互
 * - 渲染菜品列表
 * - 分类切换
 * - 加减购物车
 * - 随机点菜
 */

(function () {
  'use strict';

  var dishes = window.MOCK_DATA.dishes;
  var categories = window.MOCK_DATA.categories;
  var user = window.MOCK_DATA.user;

  // 购物车：{ dishId: quantity }
  var cart = { 'dish-5': 1, 'dish-1': 1, 'dish-11': 1 };

  var currentCategory = 'cat-2'; // 默认选中"蔬菜也要吃呀"
  var dishListEl = document.getElementById('dishList');
  var cartCountEl = document.getElementById('cartCount');
  var cartBadgeEl = document.querySelector('.search-bar__cart-badge .badge');

  // ===== 顶部用户区 & 团队 =====
  function renderUserInfo() {
    var avatarEl = document.getElementById('userAvatar');
    var nameEl = document.getElementById('userNickname');
    var teamEl = document.getElementById('teamName');
    if (avatarEl) avatarEl.textContent = user.avatar || '👤';
    if (nameEl) nameEl.textContent = user.nickname || '用户';
    if (teamEl && user.teams && user.teams.length) {
      teamEl.textContent = user.teams[0].name;
    }
  }

  // ===== 左侧分类（按 mock 数据渲染）=====
  function renderSidebar() {
    var sidebarEl = document.getElementById('categorySidebar');
    if (!sidebarEl) return;
    var html = categories.map(function (c) {
      var active = c.id === currentCategory ? ' category-item--active' : '';
      return (
        '<div class="category-item' + active + '" data-cat="' + c.id + '">' +
          '<span class="category-item__icon">' + c.icon + '</span>' +
          '<span class="category-item__name">' + c.name + '</span>' +
          '<span class="category-item__count">' + c.count + '</span>' +
        '</div>'
      );
    }).join('');
    sidebarEl.innerHTML = html;
  }

  // 渲染菜品列表
  function renderDishes(categoryId) {
    var filtered = dishes.filter(function (d) {
      return d.categoryId === categoryId;
    });

    var catName = categories.find(function (c) { return c.id === categoryId; });
    var titleText = catName ? catName.name + '（' + filtered.length + '）' : '';

    var html = '<div class="dish-list__category-title">' + titleText + '</div>';

    filtered.forEach(function (dish) {
      var qty = cart[dish.id] || 0;
      html += renderDishCard(dish, qty);
    });

    dishListEl.innerHTML = html;
    bindDishEvents();
  }

  // 渲染单个菜品卡片
  function renderDishCard(dish, qty) {
    var actionHtml = '';
    if (qty > 0) {
      actionHtml =
        '<div class="dish-card__action">' +
          '<button class="qty-btn qty-btn--minus" data-action="minus" data-id="' + dish.id + '">−</button>' +
          '<span class="qty-display">' + qty + '</span>' +
          '<button class="qty-btn qty-btn--plus" data-action="plus" data-id="' + dish.id + '">+</button>' +
        '</div>';
    } else {
      actionHtml =
        '<button class="qty-btn qty-btn--plus" data-action="plus" data-id="' + dish.id + '">+</button>';
    }

    return (
      '<div class="dish-card">' +
        '<div class="dish-card__image" style="background:' + dish.color + '">' + dish.emoji + '</div>' +
        '<div class="dish-card__body">' +
          '<div>' +
            '<div class="dish-card__name">' + dish.name + '</div>' +
            '<div class="dish-card__desc">' + dish.desc + '</div>' +
            '<div class="dish-card__meta">' +
              '<span class="dish-card__rating">⭐ ' + dish.rating +
                '<span class="dish-card__rating-count"> (' + dish.ratingCount + ')</span>' +
              '</span>' +
              '<span class="dish-card__cook-time">⏱ ' + dish.cookTime + '分钟</span>' +
            '</div>' +
          '</div>' +
          '<div class="dish-card__footer">' +
            '<span class="dish-card__price"><span class="dish-card__price-symbol">¥</span>' + dish.price.toFixed(2) + '</span>' +
            actionHtml +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // 绑定菜品卡片事件
  function bindDishEvents() {
    var buttons = dishListEl.querySelectorAll('[data-action]');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        var id = btn.getAttribute('data-id');
        if (action === 'plus') {
          cart[id] = (cart[id] || 0) + 1;
        } else if (action === 'minus') {
          cart[id] = (cart[id] || 0) - 1;
          if (cart[id] <= 0) delete cart[id];
        }
        renderDishes(currentCategory);
        updateCartBadge();
      });
    });
  }

  // 更新购物车数量
  function updateCartBadge() {
    var total = 0;
    Object.keys(cart).forEach(function (k) { total += cart[k]; });
    cartCountEl.textContent = total;
    if (cartBadgeEl) {
      cartBadgeEl.textContent = total;
      cartBadgeEl.style.display = total > 0 ? '' : 'none';
    }
  }

  // 分类切换
  function bindCategorySwitch() {
    var items = document.querySelectorAll('.category-item');
    items.forEach(function (item) {
      item.addEventListener('click', function () {
        items.forEach(function (i) { i.classList.remove('category-item--active'); });
        item.classList.add('category-item--active');
        currentCategory = item.getAttribute('data-cat');
        renderDishes(currentCategory);
      });
    });
  }

  // 随机点菜
  function bindRandom() {
    var btn = document.getElementById('btnRandom');
    if (!btn) return;
    btn.addEventListener('click', function () {
      // 随机挑 3 道菜加入购物车
      var pool = dishes.slice();
      // 洗牌
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      var picks = pool.slice(0, 3);
      picks.forEach(function (d) {
        cart[d.id] = (cart[d.id] || 0) + 1;
      });
      renderDishes(currentCategory);
      updateCartBadge();
      showToast('🎲 随机为你选了 ' + picks.map(function (d) { return d.name; }).join('、'));
    });
  }

  // 下单按钮：把购物车写成草稿订单再跳转订单详情（原型演示）
  function bindSubmit() {
    var btn = document.getElementById('btnSubmit');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var total = 0;
      Object.keys(cart).forEach(function (k) { total += cart[k]; });
      if (total === 0) {
        showToast('购物车是空的，先点几道菜吧');
        return;
      }

      // 组装菜品明细
      var items = Object.keys(cart).map(function (id) {
        var d = dishes.filter(function (x) { return x.id === id; })[0];
        if (!d) return null;
        return {
          dishId: d.id,
          name: d.name,
          emoji: d.emoji,
          color: d.color,
          price: d.price,
          quantity: cart[id]
        };
      }).filter(Boolean);

      var totalAmount = 0;
      var totalCount = 0;
      items.forEach(function (it) {
        totalAmount += it.price * it.quantity;
        totalCount += it.quantity;
      });

      var draft = {
        id: 'order-draft',
        pickupCode: String(1000 + (window.MOCK_DATA.orders ? window.MOCK_DATA.orders.length : 0) + 1),
        status: 'pending',
        userId: user.id,
        userAvatar: user.avatar,
        userNickname: user.nickname,
        teamName: (user.teams && user.teams.length) ? user.teams[0].name : '我的团队',
        createdAt: formatNow(),
        items: items,
        totalAmount: totalAmount,
        totalCount: totalCount
      };

      try {
        sessionStorage.setItem('ggc:order-draft', JSON.stringify(draft));
      } catch (e) { /* 忽略 */ }

      // 跳转到订单详情页（原型演示）
      location.href = 'order-detail.html';
    });
  }

  // 邀请下单（占位）
  function bindInvite() {
    var btn = document.getElementById('btnInvite');
    if (!btn) return;
    btn.addEventListener('click', function () {
      showToast('邀请链接已生成，发送给团队成员一起来点菜吧（原型演示）');
    });
  }

  // 当前时间格式化 YYYY-MM-DD HH:mm:ss
  function formatNow() {
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // 简易 Toast
  function showToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'background:rgba(0,0,0,0.8);color:#fff;padding:12px 20px;border-radius:10px;' +
      'font-size:14px;z-index:9999;max-width:280px;text-align:center;animation:fadeIn 0.2s;';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2000);
  }

  // 初始化
  renderUserInfo();
  renderSidebar();
  renderDishes(currentCategory);
  bindCategorySwitch();
  bindRandom();
  bindInvite();
  bindSubmit();
  updateCartBadge();
})();
