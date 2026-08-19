/**
 * 订单详情页交互
 * - 渲染订单详情（取餐码 + 状态流转 + 菜品清单）
 * - 参数 ?id= 指定展示某笔订单；无参数时优先展示"下单"草稿，否则展示最近一笔订单
 * - 状态推进：待接单 → 已接单 → 制作中 → 待取餐 → 已完成（原型演示）
 * - 复制订单信息：生成纯文本，方便发微信群
 */

(function () {
  'use strict';

  var orders = window.MOCK_DATA.orders;
  var statusMap = window.MOCK_DATA.orderStatusMap;
  var container = document.getElementById('orderDetail');

  // 状态流转顺序
  var STATUS_FLOW = ['pending', 'accepted', 'cooking', 'ready', 'completed'];

  // 从 URL 读取 ?id=
  function getQueryId() {
    var m = location.search.match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // 读取菜单页"下单"写入的草稿
  function getDraft() {
    try {
      var raw = sessionStorage.getItem('ggc:order-draft');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setDraft(order) {
    try {
      sessionStorage.setItem('ggc:order-draft', JSON.stringify(order));
    } catch (e) { /* 忽略 */ }
  }

  // 决定展示哪笔订单
  function pickOrder() {
    var qid = getQueryId();
    if (qid) {
      var found = orders.filter(function (o) { return o.id === qid; })[0];
      if (found) return found;
    }
    var draft = getDraft();
    if (draft && draft.items && draft.items.length) return draft;
    // 默认展示最近一笔（数组最后一条）
    return orders[orders.length - 1];
  }

  // HTML 转义
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 状态徽章
  function statusChip(status) {
    var m = statusMap[status] || { label: status, color: '#666666', bgColor: '#F5F5F5' };
    return '<span class="status-chip" style="color:' + m.color + ';background:' + m.bgColor + '">' + m.label + '</span>';
  }

  // 取餐码主卡片
  function renderPickup(order) {
    return (
      '<div class="pickup-card">' +
        '<div class="pickup-card__label">取 餐 码</div>' +
        '<div class="pickup-card__code">' + esc(order.pickupCode) + '</div>' +
        '<div class="pickup-card__hint">厨师做完凭码喊你 · 如「' + esc(order.pickupCode) + ' 好了」</div>' +
      '</div>'
    );
  }

  // 状态流转步骤条
  function renderStepper(status) {
    var idx = STATUS_FLOW.indexOf(status);
    if (idx < 0) return '';
    var html = '<div class="order-stepper">';
    STATUS_FLOW.forEach(function (s, i) {
      var cls = 'order-stepper__step';
      if (i < idx) cls += ' order-stepper__step--done';
      if (i === idx) cls += ' order-stepper__step--current';
      html += '<div class="' + cls + '">' +
        '<div class="order-stepper__dot">' + (i < idx ? '✓' : (i + 1)) + '</div>' +
        '<div class="order-stepper__label">' + statusMap[s].label + '</div>' +
      '</div>';
      if (i < STATUS_FLOW.length - 1) {
        html += '<div class="order-stepper__line"></div>';
      }
    });
    html += '</div>';
    return html;
  }

  // 信息行（团队 / 点餐人 / 下单时间）
  function renderInfo(order) {
    var rows = [
      ['点餐团队', order.teamName || '—'],
      ['点餐人', (order.userAvatar || '') + ' ' + (order.userNickname || '—')],
      ['下单时间', order.createdAt || '—']
    ];
    var html = '';
    rows.forEach(function (row) {
      html += '<div class="info-row">' +
        '<span class="info-row__label">' + row[0] + '</span>' +
        '<span class="info-row__value">' + esc(row[1]) + '</span>' +
      '</div>';
    });
    return '<div class="order-section">' + html + '</div>';
  }

  // 菜品清单
  function renderItems(order) {
    var html = (
      '<div class="order-section">' +
        '<div class="order-section__header">' +
          '<span>菜品清单</span>' +
          '<span class="text-placeholder text-xs">共 ' + order.items.length + ' 种</span>' +
        '</div>'
    );
    order.items.forEach(function (item) {
      html +=
        '<div class="order-item">' +
          '<div class="order-item__image" style="background:' + esc(item.color || '#E0E0E0') + '">' + esc(item.emoji || '🍽') + '</div>' +
          '<div class="order-item__body">' +
            '<div class="order-item__name">' + esc(item.name) + '</div>' +
            '<div class="order-item__meta">单价 ¥' + Number(item.price).toFixed(2) + '</div>' +
          '</div>' +
          '<div class="order-item__right">' +
            '<div class="order-item__qty">×' + item.quantity + '</div>' +
            '<div class="order-item__total">¥' + (Number(item.price) * item.quantity).toFixed(2) + '</div>' +
          '</div>' +
        '</div>';
    });
    html +=
      '<div class="order-summary">' +
        '<span class="order-summary__count">共 ' + order.totalCount + ' 道</span>' +
        '<span class="order-summary__amount">¥' + Number(order.totalAmount).toFixed(2) + '</span>' +
      '</div>' +
    '</div>';
    return html;
  }

  // 生成订单纯文本（发微信群用）
  function buildOrderText(order) {
    var lines = [];
    lines.push('【好好吃饭·取餐码】' + order.pickupCode);
    lines.push('团队：' + (order.teamName || '—'));
    lines.push('点餐人：' + (order.userNickname || '—'));
    lines.push('下单时间：' + (order.createdAt || '—'));
    lines.push('————————————');
    order.items.forEach(function (item) {
      lines.push(item.name + ' ×' + item.quantity + '  ¥' + (Number(item.price) * item.quantity).toFixed(2));
    });
    lines.push('————————————');
    lines.push('共 ' + order.totalCount + ' 道 · 合计 ¥' + Number(order.totalAmount).toFixed(2));
    return lines.join('\n');
  }

  // 复制到剪贴板（file:// 下 navigator.clipboard 可能不可用，做降级）
  function copyText(text, done) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }

  // 根据状态计算主按钮文案与推进动作
  function nextAction(order) {
    switch (order.status) {
      case 'pending':  return { label: '发送给厨师', toast: '已发送给厨师，等待接单' };
      case 'accepted': return { label: '开始制作',   toast: '已开始制作（原型演示）' };
      case 'cooking':  return { label: '完成制作',   toast: '已完成制作，可凭码取餐' };
      case 'ready':    return { label: '确认取餐',   toast: '取餐成功，祝用餐愉快！' };
      default:         return { label: '再次点菜',   toast: '已为你重新点好这道菜（原型演示）' };
    }
  }

  function advanceStatus(order) {
    var idx = STATUS_FLOW.indexOf(order.status);
    if (idx >= 0 && idx < STATUS_FLOW.length - 1) {
      order.status = STATUS_FLOW[idx + 1];
      // 草稿状态推进时同步回 sessionStorage
      if (!getQueryId()) setDraft(order);
    }
  }

  // 底部操作栏
  function renderActions(order) {
    var action = nextAction(order);
    return (
      '<div class="order-actions">' +
        '<button class="order-actions__btn order-actions__btn--copy" id="btnCopy">📋 复制订单信息</button>' +
        '<button class="order-actions__btn order-actions__btn--primary" id="btnPrimary">' + action.label + '</button>' +
      '</div>'
    );
  }

  // 整页渲染
  function render() {
    var order = pickOrder();
    if (!order) {
      container.innerHTML = '<div class="empty-state">暂无订单，去点几道菜吧</div>';
      return;
    }

    var statusLine = (
      '<div class="order-section order-section--status">' +
        '<div class="order-section__header">' +
          '<span>订单状态</span>' +
          statusChip(order.status) +
        '</div>' +
        renderStepper(order.status) +
      '</div>'
    );

    container.innerHTML =
      statusLine +
      renderPickup(order) +
      renderInfo(order) +
      renderItems(order) +
      renderActions(order);

    bindActions(order);
  }

  function bindActions(order) {
    var btnCopy = document.getElementById('btnCopy');
    var btnPrimary = document.getElementById('btnPrimary');

    if (btnCopy) {
      btnCopy.addEventListener('click', function () {
        copyText(buildOrderText(order), function (ok) {
          showToast(ok ? '已复制订单信息，去微信群粘贴吧' : '复制失败，请长按手动复制');
        });
      });
    }

    if (btnPrimary) {
      btnPrimary.addEventListener('click', function () {
        if (order.status === 'completed') {
          showToast('已加入购物车，去菜谱页再看看（原型演示）');
          return;
        }
        var action = nextAction(order);
        advanceStatus(order);
        showToast(action.toast);
        render();
      });
    }
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
  render();
})();