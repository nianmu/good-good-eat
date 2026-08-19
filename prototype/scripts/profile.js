/**
 * 我的页面交互
 * - 渲染我的团队列表（mock 数据 user.teams）
 * - 渲染功能宫格（mock 数据 myFeatures）
 * - 占位交互：宫格点击提示"开发中"
 */

(function () {
  'use strict';

  var user = window.MOCK_DATA.user;
  var features = window.MOCK_DATA.myFeatures;
  var teamListEl = document.getElementById('teamList');
  var featureGridEl = document.getElementById('featureGrid');

  var ROLE_LABEL = { organizer: '组织者', member: '成员' };
  var TEAM_ICONS = ['🏠', '🍽', '🎓'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ===== 我的团队 =====
  function renderTeams() {
    if (!teamListEl) return;
    if (!user.teams || !user.teams.length) {
      teamListEl.innerHTML = '<div class="empty-state">还没有加入团队，去创建一个吧</div>';
      return;
    }

    var html = user.teams.map(function (t, i) {
      var role = ROLE_LABEL[t.role] || '成员';
      var chefHtml = t.chef
        ? '<span class="team-item__chef">👨‍🍳 厨师：' + esc(t.chef) + '</span>'
        : '<span class="team-item__chef team-item__chef--open">👨‍🍳 厨师待认领</span>';

      return (
        '<div class="team-item">' +
          '<div class="team-item__avatar">' + esc(t.icon || TEAM_ICONS[i % TEAM_ICONS.length]) + '</div>' +
          '<div class="team-item__body">' +
            '<div class="team-item__name">' +
              esc(t.name) +
              '<span class="team-item__role">' + role + '</span>' +
            '</div>' +
            '<div class="team-item__meta">' +
              t.memberCount + ' 位成员 · ' + chefHtml +
            '</div>' +
          '</div>' +
          '<div class="team-item__arrow">›</div>' +
        '</div>'
      );
    }).join('');

    teamListEl.innerHTML = html;
  }

  // ===== 功能宫格 =====
  function renderFeatures() {
    if (!featureGridEl) return;

    var html = features.map(function (f) {
      var bg = f.color + '1F'; // 颜色叠加 12% 透明度作为浅色底
      return (
        '<div class="feature-item" data-name="' + esc(f.name) + '">' +
          '<div class="feature-item__icon" style="background:' + bg + ';color:' + f.color + '">' + esc(f.icon) + '</div>' +
          '<div class="feature-item__name">' + esc(f.name) + '</div>' +
        '</div>'
      );
    }).join('');

    featureGridEl.innerHTML = html;

    featureGridEl.querySelectorAll('.feature-item').forEach(function (item) {
      item.addEventListener('click', function () {
        showToast('「' + item.getAttribute('data-name') + '」开发中，敬请期待');
      });
    });
  }

  // 团队管理入口占位
  function bindTeamManage() {
    var more = document.querySelector('.section__more');
    if (!more) return;
    more.addEventListener('click', function () {
      showToast('团队管理页开发中，敬请期待');
    });
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
  renderTeams();
  renderFeatures();
  bindTeamManage();
})();