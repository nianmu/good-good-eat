'use strict';

/**
 * 纯前端 Mock 数据层
 * ----------------------------------------
 * 用途：后端（FastAPI，docs/02-开发规划.md §4.4）尚未就绪时，
 * 以完全一致的路由/请求/响应结构模拟全部接口，让小程序离线可跑通
 * 浏览 → 加购 → 下单 → 取餐码 → 状态流转 → 订单列表/详情 全流程。
 *
 * 数据说明：
 * - 种子数据转录自 prototype/scripts/data/*.js，字段名已统一为后端
 *   snake_case 契约（category_id / rating_count / cook_time /
 *   order_no / pickup_code / team_name / created_at / total_amount …），
 *   切换 useMock=false 联调真实后端时无需任何字段转换。
 * - 订单状态推进支持持久化：整个 mock 数据库写入 wx storage
 *   （ggc:mock:db），页面刷新 / 重开小程序状态不丢。
 * - 为保证演示效果：首次进入时 mock 会直接以种子用户（用户16tQW，
 *   含 3 笔订单、3 个团队、统计数据）的身份完成游客登录，
 *   与原型 data 完全一致，订单列表/我的页/团队页开箱即有内容。
 * - 种子订单共 12 笔（3 笔原型订单 + 9 笔历史订单），配合分页
 *   （page_size=8）可演示「上拉触底加载」。
 */

const store = require('./store');
const util = require('./util');

const DB_KEY = 'ggc:mock:db';
const GUEST_USER_ID = 'user-16tQW'; // 种子演示用户（原型同源）

/* =====================================================
 * 种子数据
 * ===================================================== */

function seedUsers() {
  const users = [
    {
      id: 'user-16tQW', nickname: '用户16tQW', avatar: '👨', code: '38243244',
      is_guest: 0,
      stats: { totalOrders: 28, totalDishes: 96, favoriteDishes: 15 }
    },
    {
      id: 'user-mom', nickname: '妈妈', avatar: '👩‍🍳', code: '11223344',
      is_guest: 0,
      stats: { totalOrders: 40, totalDishes: 120, favoriteDishes: 20 }
    },
    {
      id: 'user-other', nickname: '老王', avatar: '👨‍🍳', code: '98765432',
      is_guest: 0,
      stats: { totalOrders: 12, totalDishes: 40, favoriteDishes: 5 }
    }
  ];
  // 团队填充成员（凑足原型 memberCount 4/6/12）
  const fillers = [
    { id: 'user-c1', nickname: '成员甲', avatar: '👦' },
    { id: 'user-c2', nickname: '成员乙', avatar: '👧' },
    { id: 'user-f1', nickname: '饭友1', avatar: '🧑' },
    { id: 'user-f2', nickname: '饭友2', avatar: '👩' },
    { id: 'user-f3', nickname: '饭友3', avatar: '👨' },
    { id: 'user-f4', nickname: '饭友4', avatar: '🧑' },
    { id: 'user-f5', nickname: '饭友5', avatar: '👩' },
    { id: 'user-g1', nickname: '社友1', avatar: '👦' },
    { id: 'user-g2', nickname: '社友2', avatar: '👧' },
    { id: 'user-g3', nickname: '社友3', avatar: '🧑' },
    { id: 'user-g4', nickname: '社友4', avatar: '👩' },
    { id: 'user-g5', nickname: '社友5', avatar: '👨' },
    { id: 'user-g6', nickname: '社友6', avatar: '🧑' },
    { id: 'user-g7', nickname: '社友7', avatar: '👩' },
    { id: 'user-g8', nickname: '社友8', avatar: '👦' },
    { id: 'user-g9', nickname: '社友9', avatar: '👧' },
    { id: 'user-g10', nickname: '社友10', avatar: '🧑' }
  ];
  fillers.forEach(function (f, i) {
    users.push({
      id: f.id, nickname: f.nickname, avatar: f.avatar,
      code: String(20000000 + i), is_guest: 0,
      stats: { totalOrders: 0, totalDishes: 0, favoriteDishes: 0 }
    });
  });
  return users;
}

function seedTeams() {
  return [
    { id: 'team-1', name: '我家', invite_code: 'A1B2C3D4', owner_id: 'user-16tQW', chef_id: 'user-mom', icon: '🏠' },
    { id: 'team-2', name: '朋友聚餐', invite_code: 'E5F6G7H8', owner_id: 'user-16tQW', chef_id: 'user-16tQW', icon: '🍽' },
    { id: 'team-3', name: '社团饭局', invite_code: 'I9J0K1L2', owner_id: 'user-other', chef_id: 'user-other', icon: '🎓' },
    // 4 号团队用于「加入团队」演示：种子用户不在其中
    { id: 'team-4', name: '楼下食堂', invite_code: 'F0O0D4E2', owner_id: 'user-other', chef_id: null, icon: '🏪' }
  ];
}

function seedMembers() {
  const members = [];
  // 我家：4 人
  members.push({ team_id: 'team-1', user_id: 'user-16tQW', role: 'organizer' });
  members.push({ team_id: 'team-1', user_id: 'user-mom', role: 'member' });
  members.push({ team_id: 'team-1', user_id: 'user-c1', role: 'member' });
  members.push({ team_id: 'team-1', user_id: 'user-c2', role: 'member' });
  // 朋友聚餐：6 人
  members.push({ team_id: 'team-2', user_id: 'user-16tQW', role: 'member' });
  ['user-f1', 'user-f2', 'user-f3', 'user-f4', 'user-f5'].forEach(function (uid) {
    members.push({ team_id: 'team-2', user_id: uid, role: 'member' });
  });
  // 社团饭局：12 人
  members.push({ team_id: 'team-3', user_id: 'user-other', role: 'organizer' });
  members.push({ team_id: 'team-3', user_id: 'user-16tQW', role: 'member' });
  ['user-g1', 'user-g2', 'user-g3', 'user-g4', 'user-g5',
    'user-g6', 'user-g7', 'user-g8', 'user-g9', 'user-g10'].forEach(function (uid) {
    members.push({ team_id: 'team-3', user_id: uid, role: 'member' });
  });
  // 楼下食堂：仅创建者
  members.push({ team_id: 'team-4', user_id: 'user-other', role: 'organizer' });
  return members;
}

function seedCategories() {
  return [
    { id: 'cat-1', name: '荤菜', icon: '🥩', sort_order: 1 },
    { id: 'cat-2', name: '蔬菜也要吃呀', icon: '🥬', sort_order: 2 },
    { id: 'cat-3', name: '美味能量补给', icon: '🍳', sort_order: 3 },
    { id: 'cat-4', name: '饭后最后一口汤', icon: '🍲', sort_order: 4 },
    { id: 'cat-5', name: '主食', icon: '🍚', sort_order: 5 },
    { id: 'cat-6', name: '凉菜', icon: '🥒', sort_order: 6 }
  ];
}

function seedDishes() {
  return [
    // ===== 荤菜 =====
    { id: 'dish-1', category_id: 'cat-1', name: '红烧肉', price: 28.00, rating: 4.8, rating_count: 326, description: '肥而不腻，入口即化，经典家常味', emoji: '🥩', color: '#FFAB91', ingredients: ['五花肉', '冰糖', '生抽', '老抽', '料酒'], cook_time: 60, difficulty: '中等' },
    { id: 'dish-2', category_id: 'cat-1', name: '可乐鸡翅', price: 25.00, rating: 4.7, rating_count: 218, description: '甜香入味，连骨头都嘬干净', emoji: '🍗', color: '#FFCC80', ingredients: ['鸡翅', '可乐', '生抽', '姜'], cook_time: 30, difficulty: '简单' },
    { id: 'dish-3', category_id: 'cat-1', name: '糖醋排骨', price: 32.00, rating: 4.9, rating_count: 412, description: '酸甜适口，外酥里嫩', emoji: '🍖', color: '#EF9A9A', ingredients: ['排骨', '醋', '糖', '生抽'], cook_time: 45, difficulty: '中等' },
    { id: 'dish-4', category_id: 'cat-1', name: '水煮鱼', price: 38.00, rating: 4.6, rating_count: 189, description: '麻辣鲜香，鱼肉嫩滑', emoji: '🐟', color: '#90CAF9', ingredients: ['草鱼', '豆芽', '花椒', '干辣椒'], cook_time: 40, difficulty: '较难' },
    // ===== 蔬菜 =====
    { id: 'dish-5', category_id: 'cat-2', name: '蒜蓉西兰花', price: 12.00, rating: 4.5, rating_count: 156, description: '清淡爽口，营养保留好', emoji: '🥦', color: '#A5D6A7', ingredients: ['西兰花', '蒜', '盐'], cook_time: 10, difficulty: '简单' },
    { id: 'dish-6', category_id: 'cat-2', name: '酸辣藕片', price: 14.00, rating: 4.6, rating_count: 203, description: '脆爽开胃，酸辣过瘾', emoji: '🥬', color: '#CE93D8', ingredients: ['莲藕', '醋', '辣椒', '蒜'], cook_time: 15, difficulty: '简单' },
    { id: 'dish-7', category_id: 'cat-2', name: '红烧茄子', price: 13.00, rating: 4.7, rating_count: 278, description: '软糯入味，下饭神器', emoji: '🍆', color: '#B39DDB', ingredients: ['茄子', '蒜', '生抽', '糖'], cook_time: 20, difficulty: '简单' },
    { id: 'dish-8', category_id: 'cat-2', name: '干煸四季豆', price: 15.00, rating: 4.5, rating_count: 167, description: '干香入味，脆嫩可口', emoji: '🫛', color: '#81C784', ingredients: ['四季豆', '肉末', '蒜', '干辣椒'], cook_time: 18, difficulty: '中等' },
    // ===== 能量补给 =====
    { id: 'dish-9', category_id: 'cat-3', name: '葱花火腿鸡蛋饼', price: 8.00, rating: 4.4, rating_count: 89, description: '快手早餐，营养均衡', emoji: '🥞', color: '#FFE082', ingredients: ['鸡蛋', '火腿', '葱花', '面粉'], cook_time: 15, difficulty: '简单' },
    { id: 'dish-10', category_id: 'cat-3', name: '麻婆豆腐', price: 16.00, rating: 4.8, rating_count: 345, description: '麻、辣、烫、香、酥、嫩', emoji: '🧈', color: '#FFAB91', ingredients: ['豆腐', '肉末', '豆瓣酱', '花椒'], cook_time: 20, difficulty: '中等' },
    // ===== 汤 =====
    { id: 'dish-11', category_id: 'cat-4', name: '番茄蛋花汤', price: 10.00, rating: 4.5, rating_count: 234, description: '酸甜开胃，汤色诱人', emoji: '🍅', color: '#EF9A9A', ingredients: ['番茄', '鸡蛋', '葱花'], cook_time: 10, difficulty: '简单' },
    { id: 'dish-12', category_id: 'cat-4', name: '玉米排骨汤', price: 22.00, rating: 4.7, rating_count: 198, description: '清甜滋补，老少皆宜', emoji: '🌽', color: '#FFF59D', ingredients: ['排骨', '玉米', '胡萝卜', '姜'], cook_time: 90, difficulty: '简单' },
    // ===== 主食 =====
    { id: 'dish-13', category_id: 'cat-5', name: '蛋炒饭', price: 10.00, rating: 4.6, rating_count: 412, description: '粒粒分明，金黄诱人', emoji: '🍚', color: '#FFE0B2', ingredients: ['米饭', '鸡蛋', '葱花', '胡萝卜'], cook_time: 10, difficulty: '简单' },
    { id: 'dish-14', category_id: 'cat-5', name: '葱油拌面', price: 8.00, rating: 4.5, rating_count: 267, description: '葱香四溢，简单美味', emoji: '🍜', color: '#D7CCC8', ingredients: ['面条', '葱', '生抽', '老抽'], cook_time: 15, difficulty: '简单' },
    // ===== 凉菜 =====
    { id: 'dish-15', category_id: 'cat-6', name: '凉拌黄瓜', price: 8.00, rating: 4.4, rating_count: 178, description: '爽脆开胃，解腻首选', emoji: '🥒', color: '#C5E1A5', ingredients: ['黄瓜', '蒜', '醋', '辣椒'], cook_time: 5, difficulty: '简单' },
    { id: 'dish-16', category_id: 'cat-6', name: '皮蛋豆腐', price: 10.00, rating: 4.3, rating_count: 145, description: '清凉爽滑，夏日必备', emoji: '🥚', color: '#B0BEC5', ingredients: ['内酯豆腐', '皮蛋', '葱花', '生抽'], cook_time: 5, difficulty: '简单' }
  ];
}

/** 订单菜品快照构建 */
function itemSnapshot(dish, quantity) {
  return {
    dish_id: dish.id,
    name: dish.name,
    emoji: dish.emoji,
    color: dish.color,
    price: dish.price,
    quantity: quantity
  };
}

function seedOrders(dishes) {
  const byId = {};
  dishes.forEach(function (d) { byId[d.id] = d; });
  const it = function (did, qty) { return itemSnapshot(byId[did], qty); };

  const raw = [
    {
      id: 1, order_no: '20260818-000001', pickup_code: '1002', status: 'completed',
      team_id: 'team-1', created_at: '2026-08-18 11:30:32',
      items: [it('dish-9', 1)]
    },
    {
      id: 2, order_no: '20260818-000002', pickup_code: '1001', status: 'cooking',
      team_id: 'team-1', created_at: '2026-08-18 11:00:15',
      items: [it('dish-1', 1), it('dish-5', 1), it('dish-11', 1)]
    },
    {
      id: 3, order_no: '20260818-000003', pickup_code: '1001', status: 'pending',
      team_id: 'team-2', created_at: '2026-08-18 12:05:00',
      items: [it('dish-3', 2), it('dish-10', 1), it('dish-15', 1), it('dish-13', 3)]
    },
    {
      id: 4, order_no: '20260817-000004', pickup_code: '1001', status: 'completed',
      team_id: 'team-1', created_at: '2026-08-17 18:42:10',
      items: [it('dish-1', 1), it('dish-13', 2)]
    },
    {
      id: 5, order_no: '20260817-000005', pickup_code: '1001', status: 'completed',
      team_id: 'team-2', created_at: '2026-08-17 12:20:33',
      items: [it('dish-3', 1), it('dish-5', 1), it('dish-11', 1)]
    },
    {
      id: 6, order_no: '20260816-000006', pickup_code: '1001', status: 'completed',
      team_id: 'team-1', created_at: '2026-08-16 19:05:44',
      items: [it('dish-2', 2), it('dish-15', 1)]
    },
    {
      id: 7, order_no: '20260816-000007', pickup_code: '1001', status: 'completed',
      team_id: 'team-3', created_at: '2026-08-16 12:15:20',
      items: [it('dish-10', 1), it('dish-8', 1), it('dish-13', 2)]
    },
    {
      id: 8, order_no: '20260815-000008', pickup_code: '1001', status: 'completed',
      team_id: 'team-1', created_at: '2026-08-15 18:30:05',
      items: [it('dish-4', 1), it('dish-6', 1), it('dish-14', 1)]
    },
    {
      id: 9, order_no: '20260815-000009', pickup_code: '1001', status: 'completed',
      team_id: 'team-1', created_at: '2026-08-15 12:00:00',
      items: [it('dish-7', 1), it('dish-11', 1), it('dish-13', 1)]
    },
    {
      id: 10, order_no: '20260814-000010', pickup_code: '1001', status: 'completed',
      team_id: 'team-2', created_at: '2026-08-14 19:22:31',
      items: [it('dish-12', 1), it('dish-15', 2), it('dish-16', 1)]
    },
    {
      id: 11, order_no: '20260813-000011', pickup_code: '1001', status: 'completed',
      team_id: 'team-1', created_at: '2026-08-13 12:45:12',
      items: [it('dish-9', 2), it('dish-5', 1)]
    },
    {
      id: 12, order_no: '20260812-000012', pickup_code: '1001', status: 'completed',
      team_id: 'team-1', created_at: '2026-08-12 18:10:27',
      items: [it('dish-1', 1), it('dish-8', 1), it('dish-13', 1)]
    }
  ];

  return raw.map(function (o) {
    let total_amount = 0;
    let total_count = 0;
    o.items.forEach(function (i) {
      total_amount = total_amount + i.price * i.quantity;
      total_count = total_count + i.quantity;
    });
    return Object.assign({}, o, {
      user_id: 'user-16tQW',
      user_avatar: '👨',
      user_nickname: '用户16tQW',
      team_name: o.team_id === 'team-1' ? '我家' : (o.team_id === 'team-2' ? '朋友聚餐' : '社团饭局'),
      total_amount: Math.round(total_amount * 100) / 100,
      total_count: total_count
    });
  });
}

function seedFavorites() {
  // 演示用户收藏了两道菜（红烧肉 dish-1、蛋炒饭 dish-13）
  return [
    { user_id: 'user-16tQW', dish_id: 'dish-1', created_at: '2026-08-15 10:00:00' },
    { user_id: 'user-16tQW', dish_id: 'dish-13', created_at: '2026-08-16 19:30:00' }
  ];
}

function seedRecipes() {
  return [
    {
      id: 'recipe-1',
      user_id: 'user-16tQW',
      name: '妈妈的糖醋里脊',
      emoji: '🍖',
      color: '#EF9A9A',
      description: '酸甜可口，外酥里嫩，全家都爱。',
      ingredients: ['里脊肉', '番茄酱', '醋', '糖'],
      steps: ['里脊切条腌 10 分钟', '裹淀粉下锅炸至金黄', '炒糖醋汁收汁裹匀'],
      cook_time: 30,
      difficulty: '中等',
      image_url: null,
      is_public: false,
      created_at: '2026-08-10 12:00:00'
    },
    {
      id: 'recipe-2',
      user_id: 'user-mom',
      name: '夏日凉拌木耳',
      emoji: '🥗',
      color: '#A5D6A7',
      description: '清爽开胃，解腻必备的小凉菜。',
      ingredients: ['木耳', '黄瓜', '蒜', '辣椒'],
      steps: ['木耳泡发焯水', '黄瓜拍碎切段', '加蒜末辣椒拌匀'],
      cook_time: 15,
      difficulty: '简单',
      image_url: null,
      is_public: true,
      created_at: '2026-08-05 09:00:00'
    }
  ];
}

function seedFridge() {
  return [
    { id: 'fridge-1', user_id: 'user-16tQW', name: '五花肉', quantity: '500g', updated_at: '2026-08-18 08:00:00' },
    { id: 'fridge-2', user_id: 'user-16tQW', name: '冰糖', quantity: '少量', updated_at: '2026-08-18 08:00:00' },
    { id: 'fridge-3', user_id: 'user-16tQW', name: '黄瓜', quantity: '2根', updated_at: '2026-08-17 20:00:00' }
  ];
}

function seedBasket() {
  return [
    { id: 'basket-1', user_id: 'user-16tQW', name: '鸡蛋', quantity: '10个', checked: false, created_at: '2026-08-18 09:00:00' },
    { id: 'basket-2', user_id: 'user-16tQW', name: '牛奶', quantity: '2盒', checked: true, created_at: '2026-08-18 09:05:00' }
  ];
}

function seedDB() {
  const users = seedUsers();
  const dishes = seedDishes();
  const teams = seedTeams();
  const members = seedMembers();
  return {
    users: users,
    teams: teams,
    members: members,
    categories: seedCategories(),
    dishes: dishes,
    orders: seedOrders(dishes),
    messages: seedMessages(users),
    favorites: seedFavorites(),
    recipes: seedRecipes(),
    fridge: seedFridge(),
    basket: seedBasket(),
    meta: { seeded: true }
  };
}

/** 种子消息（给演示用户 user-16tQW 3 条，含未读） */
function seedMessages(users) {
  const u = users.find(function (x) { return x.id === 'user-16tQW'; });
  const uid = u ? u.id : 'user-16tQW';
  return [
    {
      id: 'msg-1',
      user_id: uid,
      type: 'order',
      title: '订单 1001 状态更新',
      content: '订单 1001 已开始制作（厨师：妈妈）',
      is_read: false,
      created_at: '2026-08-18 11:05:12'
    },
    {
      id: 'msg-2',
      user_id: uid,
      type: 'order',
      title: '新订单 1003',
      content: '新订单 取餐码 1003 待接单',
      is_read: false,
      created_at: '2026-08-18 12:05:30'
    },
    {
      id: 'msg-3',
      user_id: uid,
      type: 'team',
      title: '成员加入',
      content: '老王 加入了团队「朋友聚餐」',
      is_read: true,
      created_at: '2026-08-17 20:12:05'
    }
  ];
}

/* =====================================================
 * 持久化
 * ===================================================== */

function loadDB() {
  let db = null;
  try {
    const raw = wx.getStorageSync(DB_KEY);
    if (raw && typeof raw === 'object' && raw.dishes) db = raw;
  } catch (e) {
    /* ignore */
  }
  if (!db) {
    db = seedDB();
    saveDB(db);
  }
  return db;
}

function saveDB(db) {
  try {
    wx.setStorageSync(DB_KEY, db);
  } catch (e) {
    /* ignore */
  }
}

/* =====================================================
 * 响应工具
 * ===================================================== */

function ok(data) {
  return { code: 0, message: 'ok', data: data };
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  throw e;
}

function parseUrl(url) {
  const idx = url.indexOf('?');
  const path = idx >= 0 ? url.slice(0, idx) : url;
  const query = idx >= 0 ? url.slice(idx + 1) : '';
  const params = {};
  query.split('&').forEach(function (pair) {
    if (!pair) return;
    const kv = pair.split('=');
    const k = decodeURIComponent(kv[0]);
    const v = kv.length > 1 ? decodeURIComponent(kv[1]) : '';
    params[k] = v;
  });
  return { path: path, params: params };
}

function findUserById(db, id) {
  return db.users.find(function (u) { return u.id === id; });
}

function memberRole(db, teamId, userId) {
  const m = db.members.find(function (x) {
    return x.team_id === teamId && x.user_id === userId;
  });
  return m ? m.role : null;
}

/* =====================================================
 * 认证
 * ===================================================== */

/** 当前登录用户（按 store 中的 mock token 解析） */
function currentUser(db) {
  const token = store.get('token') || '';
  const m = /^mock-token-(.+)$/.exec(token);
  if (m && m[1]) {
    const u = findUserById(db, m[1]);
    if (u) return u;
  }
  return null;
}

function attachTeams(db, user) {
  const copy = Object.assign({}, user);
  copy.teams = db.members
    .filter(function (m) { return m.user_id === user.id; })
    .map(function (m) {
      const team = db.teams.find(function (t) { return t.id === m.team_id; });
      if (!team) return null;
      const chef = team.chef_id ? findUserById(db, team.chef_id) : null;
      const memberCount = db.members.filter(function (x) { return x.team_id === team.id; }).length;
      return {
        id: team.id,
        name: team.name,
        icon: team.icon,
        invite_code: team.invite_code,
        member_count: memberCount,
        role: m.role,
        chef: chef ? chef.nickname : null,
        chef_id: team.chef_id || null,
        owner_id: team.owner_id
      };
    })
    .filter(Boolean);
  return copy;
}

/**
 * 游客/演示登录：返回种子演示用户（保证开箱即有订单/团队/统计），
 * 同时把 token 写入 store。后端就绪后该逻辑由真实 /auth/guest 替代。
 */
function guestLogin(db) {
  const user = findUserById(db, GUEST_USER_ID) || db.users[0];
  if (!user) fail(50000, 'mock 数据异常：无可用用户');
  const token = 'mock-token-' + user.id;
  store.set('token', token);
  const payload = attachTeams(db, user);
  store.set('user', payload);
  return { token: token, user: payload };
}

/** 鉴权：自动游客登录兜底（mock 模式无真实 401 逻辑） */
function ensureUser(db) {
  let u = currentUser(db);
  if (!u) u = findUserById(db, GUEST_USER_ID) || db.users[0];
  if (!u) fail(40101, '未登录');
  return u;
}

/* =====================================================
 * 各接口实现
 * ===================================================== */

function listCategories(db) {
  return db.categories
    .slice()
    .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
    .map(function (c) {
      const count = db.dishes.filter(function (d) { return d.category_id === c.id; }).length;
      return { id: c.id, name: c.name, icon: c.icon, sort_order: c.sort_order, count: count };
    });
}

function listDishes(db, params) {
  let list = db.dishes.slice();
  if (params.category_id) {
    list = list.filter(function (d) { return d.category_id === params.category_id; });
  }
  const kw = (params.keyword || '').trim();
  if (kw) {
    list = list.filter(function (d) {
      return (d.name || '').indexOf(kw) >= 0 ||
        (d.description || '').indexOf(kw) >= 0 ||
        (d.ingredients || []).some(function (i) { return i.indexOf(kw) >= 0; });
    });
  }
  const total = list.length;
  const pageSize = Math.max(1, parseInt(params.page_size, 10) || 20);
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize);
  return {
    items: items,
    total: total,
    page: page,
    page_size: pageSize,
    has_more: start + items.length < total
  };
}

function dishDetail(db, id) {
  const dish = db.dishes.find(function (d) { return d.id === id; });
  if (!dish) fail(40402, '菜品不存在或已下架');
  return dish;
}

/** /me：与真实后端契约一致 —— { user: {...含 teams}, teams: [...] } */
function mePayload(db, user) {
  const u = attachTeams(db, user);
  // stats：与后端一致（snake_case），收藏数按 favorites 集合实时计算
  const stats = Object.assign({}, user.stats || {});
  stats.favorite_dishes = (db.favorites || []).filter(function (f) {
    return f.user_id === user.id;
  }).length;
  u.stats = stats;
  return { user: u, teams: u.teams };
}

/* =====================================================
 * 四期：收藏（仅菜品）
 * ===================================================== */

function findFavorite(db, userId, dishId) {
  return (db.favorites || []).find(function (f) {
    return f.user_id === userId && String(f.dish_id) === String(dishId);
  });
}

function favoriteDish(db, dishId, user) {
  const dish = db.dishes.find(function (d) { return String(d.id) === String(dishId); });
  if (!dish) fail(40401, '菜品不存在或已下架');
  if (!findFavorite(db, user.id, dishId)) {
    db.favorites.push({
      user_id: user.id,
      dish_id: String(dishId),
      created_at: util.nowText()
    });
    saveDB(db);
  }
  return { dish_id: String(dishId), favorited: true };
}

function unfavoriteDish(db, dishId, user) {
  const fav = findFavorite(db, user.id, dishId);
  if (!fav) fail(40022, '尚未收藏该菜品');
  db.favorites = db.favorites.filter(function (f) {
    return !(f.user_id === user.id && String(f.dish_id) === String(dishId));
  });
  saveDB(db);
  return { dish_id: String(dishId), favorited: false };
}

function listFavorites(db, params, user) {
  const mine = (db.favorites || [])
    .filter(function (f) { return f.user_id === user.id; })
    .slice()
    .sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  const pageSize = Math.max(1, parseInt(params.page_size, 10) || 20);
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const start = (page - 1) * pageSize;
  const items = mine
    .slice(start, start + pageSize)
    .map(function (f) {
      const dish = db.dishes.find(function (d) { return String(d.id) === String(f.dish_id); });
      return dish ? Object.assign({}, dish, { favorite: true }) : null;
    })
    .filter(Boolean);
  return {
    items: items,
    total: mine.length,
    page: page,
    page_size: pageSize,
    has_more: start + items.length < mine.length
  };
}

/* =====================================================
 * 四期：菜谱库 CRUD
 * ===================================================== */

function nextId(collection, prefix) {
  const max = (collection || []).reduce(function (m, x) {
    const n = Number(String(x.id).replace(prefix + '-', ''));
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefix + '-' + (max + 1);
}

function recipeToPayload(r) {
  return {
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    description: r.description,
    ingredients: r.ingredients || [],
    steps: r.steps || [],
    cook_time: r.cook_time,
    difficulty: r.difficulty,
    image_url: r.image_url,
    is_public: r.is_public,
    created_at: r.created_at
  };
}

function listRecipes(db, params, user) {
  const owner = params.owner || 'me';
  if (owner !== 'me') fail(40020, '公开菜谱库暂未开放，仅支持查看我的菜谱');
  let list = (db.recipes || []).filter(function (r) { return r.user_id === user.id; });
  list = list.slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  const pageSize = Math.max(1, parseInt(params.page_size, 10) || 20);
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize).map(recipeToPayload);
  return {
    items: items,
    total: list.length,
    page: page,
    page_size: pageSize,
    has_more: start + items.length < list.length
  };
}

function findRecipe(db, id) {
  const r = (db.recipes || []).find(function (x) { return String(x.id) === String(id); });
  if (!r) fail(40401, '菜谱不存在');
  return r;
}

function getRecipe(db, id, user) {
  const r = findRecipe(db, id);
  if (r.user_id !== user.id && !r.is_public) fail(40301, '无权查看该菜谱');
  return recipeToPayload(r);
}

function createRecipe(db, data, user) {
  const name = (data.name || '').trim();
  if (!name) fail(40001, '菜谱名称不能为空');
  const r = {
    id: nextId(db.recipes, 'recipe'),
    user_id: user.id,
    name: name,
    emoji: (data.emoji || '').trim() || '🍽',
    color: (data.color || '').trim() || '#4CAF50',
    description: data.description || '',
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    steps: Array.isArray(data.steps) ? data.steps : [],
    cook_time: data.cook_time != null ? data.cook_time : null,
    difficulty: data.difficulty || null,
    image_url: data.image_url || null,
    is_public: !!data.is_public,
    created_at: util.nowText()
  };
  db.recipes.push(r);
  saveDB(db);
  return recipeToPayload(r);
}

function updateRecipe(db, id, data, user) {
  const r = findRecipe(db, id);
  if (r.user_id !== user.id) fail(40301, '无权编辑他人菜谱');
  const name = (data.name || '').trim();
  if (!name) fail(40001, '菜谱名称不能为空');
  r.name = name;
  r.emoji = (data.emoji || '').trim() || '🍽';
  r.color = (data.color || '').trim() || '#4CAF50';
  r.description = data.description || '';
  r.ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
  r.steps = Array.isArray(data.steps) ? data.steps : [];
  r.cook_time = data.cook_time != null ? data.cook_time : null;
  r.difficulty = data.difficulty || null;
  r.image_url = data.image_url || null;
  r.is_public = !!data.is_public;
  saveDB(db);
  return recipeToPayload(r);
}

function deleteRecipe(db, id, user) {
  const r = findRecipe(db, id);
  if (r.user_id !== user.id) fail(40301, '无权删除他人菜谱');
  db.recipes = db.recipes.filter(function (x) { return String(x.id) !== String(id); });
  saveDB(db);
  return { id: String(id) };
}

/* =====================================================
 * 四期：厨房（冰箱 / 菜篮）
 * ===================================================== */

function listFridge(db, user) {
  return (db.fridge || [])
    .filter(function (i) { return i.user_id === user.id; })
    .slice()
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh'); })
    .map(function (i) {
      return { id: i.id, name: i.name, quantity: i.quantity, updated_at: i.updated_at };
    });
}

function upsertFridge(db, data, user) {
  const name = (data.name || '').trim();
  if (!name) fail(40001, '食材名称不能为空');
  const existing = (db.fridge || []).find(function (i) {
    return i.user_id === user.id && i.name === name;
  });
  if (existing) {
    existing.quantity = data.quantity || '';
    existing.updated_at = util.nowText();
  } else {
    db.fridge.push({
      id: nextId(db.fridge, 'fridge'),
      user_id: user.id,
      name: name,
      quantity: data.quantity || '',
      updated_at: util.nowText()
    });
  }
  saveDB(db);
  return { id: existing ? existing.id : db.fridge[db.fridge.length - 1].id };
}

function deleteFridge(db, id, user) {
  const item = (db.fridge || []).find(function (i) {
    return String(i.id) === String(id) && i.user_id === user.id;
  });
  if (!item) fail(40401, '冰箱食材不存在');
  db.fridge = db.fridge.filter(function (i) { return String(i.id) !== String(id); });
  saveDB(db);
  return { id: String(id) };
}

/** 冰箱能做的菜推荐：命中食材数 ≥ 2，按命中数降序 */
function fridgeSuggest(db, user) {
  const owned = (db.fridge || [])
    .filter(function (i) { return i.user_id === user.id; })
    .map(function (i) { return i.name; });
  if (!owned.length) return [];

  const results = [];
  // 平台菜品
  (db.dishes || []).forEach(function (d) {
    const ings = d.ingredients || [];
    const matched = ings.filter(function (ing) { return owned.indexOf(ing) >= 0; });
    if (matched.length >= 2) {
      results.push({
        source: 'dish',
        id: d.id,
        name: d.name,
        emoji: d.emoji,
        color: d.color,
        description: d.description,
        ingredients: ings,
        matched: matched,
        total: ings.length
      });
    }
  });
  // 我的菜谱 + 公开菜谱
  (db.recipes || []).forEach(function (r) {
    if (r.user_id !== user.id && !r.is_public) return;
    const ings = r.ingredients || [];
    const matched = ings.filter(function (ing) { return owned.indexOf(ing) >= 0; });
    if (matched.length >= 2) {
      results.push({
        source: 'recipe',
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        color: r.color,
        description: r.description,
        ingredients: ings,
        matched: matched,
        total: ings.length
      });
    }
  });
  results.sort(function (a, b) { return b.matched.length - a.matched.length; });
  return results;
}

function listBasket(db, user) {
  return (db.basket || [])
    .filter(function (i) { return i.user_id === user.id; })
    .slice()
    .sort(function (a, b) {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return String(b.created_at).localeCompare(String(a.created_at));
    })
    .map(function (i) {
      return { id: i.id, name: i.name, quantity: i.quantity, checked: i.checked, created_at: i.created_at };
    });
}

function upsertBasket(db, data, user) {
  const name = (data.name || '').trim();
  if (!name) fail(40001, '菜篮项名称不能为空');
  const existing = (db.basket || []).find(function (i) {
    return i.user_id === user.id && i.name === name;
  });
  if (existing) {
    if (data.quantity) existing.quantity = data.quantity;
    existing.checked = false;
  } else {
    db.basket.push({
      id: nextId(db.basket, 'basket'),
      user_id: user.id,
      name: name,
      quantity: data.quantity || '',
      checked: false,
      created_at: util.nowText()
    });
  }
  saveDB(db);
  return existing || db.basket[db.basket.length - 1];
}

function checkBasket(db, id, data, user) {
  const item = (db.basket || []).find(function (i) {
    return String(i.id) === String(id) && i.user_id === user.id;
  });
  if (!item) fail(40401, '菜篮项不存在');
  item.checked = !!data.checked;
  saveDB(db);
  return item;
}

function deleteBasket(db, id, user) {
  const item = (db.basket || []).find(function (i) {
    return String(i.id) === String(id) && i.user_id === user.id;
  });
  if (!item) fail(40401, '菜篮项不存在');
  db.basket = db.basket.filter(function (i) { return String(i.id) !== String(id); });
  saveDB(db);
  return { id: String(id) };
}

function createTeam(db, data, user) {
  const name = (data.name || '').trim();
  if (!name) fail(40001, '团队名称不能为空');
  const existing = db.teams.find(function (t) { return t.name === name; });
  if (existing) fail(40002, '团队名称已存在');
  const id = 'team-' + (db.teams.length + 1);
  const team = {
    id: id,
    name: name,
    invite_code: util.randomCode(8),
    owner_id: user.id,
    chef_id: null,
    icon: '🏠'
  };
  db.teams.push(team);
  db.members.push({ team_id: id, user_id: user.id, role: 'organizer' });
  saveDB(db);
  return {
    id: team.id,
    name: team.name,
    icon: team.icon,
    invite_code: team.invite_code,
    member_count: 1,
    role: 'organizer',
    chef: chef,
    chef_id: null,
    owner_id: team.owner_id
  };
}

function joinTeam(db, data, user) {
  const code = String(data.invite_code || '').trim().toUpperCase();
  if (!code) fail(40001, '请输入邀请码');
  const team = db.teams.find(function (t) {
    return String(t.invite_code).toUpperCase() === code;
  });
  if (!team) fail(40403, '邀请码无效，请核对后重试');
  if (memberRole(db, team.id, user.id)) {
    fail(40004, '你已在团队中，无需重复加入');
  }
  db.members.push({ team_id: team.id, user_id: user.id, role: 'member' });
  saveDB(db);
  const chef = team.chef_id ? findUserById(db, team.chef_id) : null;
  const memberCount = db.members.filter(function (x) { return x.team_id === team.id; }).length;
  return {
    id: team.id,
    name: team.name,
    icon: team.icon,
    invite_code: team.invite_code,
    member_count: memberCount,
    role: 'member',
    chef: chef ? chef.nickname : null,
    chef_id: team.chef_id || null,
    owner_id: team.owner_id
  };
}

function teamDetail(db, id, user) {
  const team = db.teams.find(function (t) { return t.id === id; });
  if (!team) fail(40401, '团队不存在');
  if (!memberRole(db, team.id, user.id)) fail(40301, '无权查看该团队');
  const chef = team.chef_id ? findUserById(db, team.chef_id) : null;
  const members = db.members
    .filter(function (m) { return m.team_id === team.id; })
    .map(function (m) {
      const u = findUserById(db, m.user_id);
      return {
        id: m.user_id,
        nickname: u ? u.nickname : m.user_id,
        avatar: u ? u.avatar : '👤',
        role: m.role
      };
    });
  return {
    team: {
      id: team.id,
      name: team.name,
      icon: team.icon,
      invite_code: team.invite_code,
      member_count: members.length,
      role: memberRole(db, team.id, user.id),
      chef: chef ? chef.nickname : null,
      chef_id: team.chef_id || null,
      owner_id: team.owner_id
    },
    members: members
  };
}

function setTeamChef(db, id, data, user) {
  const team = db.teams.find(function (t) { return t.id === id; });
  if (!team) fail(40401, '团队不存在');
  if (memberRole(db, team.id, user.id) !== 'organizer') fail(40302, '仅组织者可指定厨师');
  const chefId = data.user_id || data.userId;
  if (!chefId || !findUserById(db, chefId)) fail(40001, '指定的成员不存在');
  if (!memberRole(db, team.id, chefId)) fail(40002, '该成员不在团队中');
  team.chef_id = chefId;
  saveDB(db);
  const chef = findUserById(db, chefId);
  return { id: team.id, chef: chef ? chef.nickname : null, chef_id: chefId };
}

function createOrder(db, data, user) {
  const team = db.teams.find(function (t) { return t.id === data.team_id; });
  if (!team) fail(40401, '团队不存在');
  const items = (data.items || []).map(function (it) {
    const dish = db.dishes.find(function (d) { return d.id === it.dish_id; });
    if (!dish) fail(40402, '菜品不存在或已下架：' + it.dish_id);
    const qty = parseInt(it.quantity, 10) || 0;
    if (qty <= 0) fail(40001, '菜品数量不合法');
    return itemSnapshot(dish, qty);
  });
  if (!items.length) fail(40001, '购物车为空，无法下单');

  let total_amount = 0;
  let total_count = 0;
  items.forEach(function (i) {
    total_amount = total_amount + i.price * i.quantity;
    total_count = total_count + i.quantity;
  });

  const date = util.todayText();
  const dayOrders = db.orders.filter(function (o) {
    return o.team_id === team.id && String(o.created_at).slice(0, 10) === date;
  });
  const codes = dayOrders.map(function (o) { return parseInt(o.pickup_code, 10); }).filter(function (n) { return !Number.isNaN(n); });
  const nextCode = codes.length ? Math.max.apply(null, codes) + 1 : 1001;

  const maxId = db.orders.reduce(function (m, o) { return Math.max(m, Number(o.id) || 0); }, 0);
  const id = maxId + 1;

  const order = {
    id: id,
    order_no: date.replace(/-/g, '') + '-' + String(id).padStart(6, '0'),
    pickup_code: String(nextCode),
    status: 'pending',
    user_id: user.id,
    user_avatar: user.avatar,
    user_nickname: user.nickname,
    team_id: team.id,
    team_name: team.name,
    chef_id: team.chef_id || null,
    created_at: util.nowText(),
    items: items,
    total_amount: Math.round(total_amount * 100) / 100,
    total_count: total_count
  };
  db.orders.push(order);
  saveDB(db);
  // 新订单通知：固定厨师；无固定厨师通知团队全员（mock 简化：通知下单人 + 演示）
  const teamObj = db.teams.find(function (t) { return t.id === team.id; });
  if (teamObj && teamObj.chef_id) {
    pushMessage(db, teamObj.chef_id, '新订单 ' + order.pickup_code, '新订单 取餐码 ' + order.pickup_code + ' 待接单');
  }
  saveDB(db);
  return order;
}

function findOrder(db, id, user) {
  const order = db.orders.find(function (o) { return String(o.id) === String(id); });
  if (!order) fail(40401, '订单不存在或无权访问');
  if (order.user_id !== user.id && !memberRole(db, order.team_id, user.id)) {
    fail(40301, '无权访问该订单');
  }
  return order;
}

function listOrders(db, params, user) {
  let list = db.orders.filter(function (o) { return o.user_id === user.id; });
  const status = params.status || '';
  if (status) list = list.filter(function (o) { return o.status === status; });
  list = list.slice().sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  const total = list.length;
  const pageSize = Math.max(1, parseInt(params.page_size, 10) || 8);
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize);
  return {
    items: items,
    total: total,
    page: page,
    page_size: pageSize,
    has_more: start + items.length < total
  };
}

function orderStatusMap() {
  return {
    pending: { label: '待接单' },
    accepted: { label: '已接单' },
    cooking: { label: '制作中' },
    ready: { label: '待取餐' },
    completed: { label: '已完成' }
  };
}

// 单向流转：accept 单独处理 pending→accepted；status 处理 subsequent。
const NEXT_STATUS = { accepted: 'cooking', cooking: 'ready', ready: 'completed' };

function acceptOrder(db, id, user) {
  const order = findOrder(db, id, user);
  if (order.status !== 'pending') fail(40010, '当前状态不可接单');
  order.status = 'accepted';
  order.chef_id = user.id;
  saveDB(db);
  pushMessage(db, order.user_id, '订单 ' + order.pickup_code + ' 状态更新', '订单 ' + order.pickup_code + ' 已被接单（厨师：' + user.nickname + '）');
  saveDB(db);
  return order;
}

function updateOrderStatus(db, id, data, user) {
  const order = findOrder(db, id, user);
  const target = data.status;
  if (!target) fail(40001, '缺少 status 参数');
  if (order.status === 'completed') fail(40011, '订单已完成，不可再流转');
  if (NEXT_STATUS[order.status] !== target) {
    fail(40012, '非法的状态流转：' + order.status + ' → ' + target);
  }
  order.status = target;
  saveDB(db);
  const statusText = { cooking: '已开始制作', ready: '已出餐，请来取餐', completed: '已完成，感谢惠顾' }[target] || target;
  pushMessage(db, order.user_id, '订单 ' + order.pickup_code + ' 状态更新', '订单 ' + order.pickup_code + ' ' + statusText);
  saveDB(db);
  return order;
}

function claimOrder(db, id, user) {
  const order = findOrder(db, id, user);
  const team = db.teams.find(function (t) { return t.id === order.team_id; });
  if (!team) fail(40401, '团队不存在');
  if (team.chef_id) fail(40013, '团队已有固定厨师');
  if (!memberRole(db, team.id, user.id)) fail(40301, '非团队成员不可认领');
  team.chef_id = user.id;
  order.chef_id = user.id;
  saveDB(db);
  pushMessage(db, order.user_id, '订单 ' + order.pickup_code + ' 已认领', '成员 ' + user.nickname + ' 认领了你的订单');
  return { id: order.id, chef_id: user.id, chef: user.nickname };
}

/* =====================================================
 * 三期：消息 / 厨师看板 / 团队购物车（mock 层）
 * ===================================================== */

/** 落一条消息（不保存，由调用方 saveDB） */
function pushMessage(db, userId, title, content) {
  const maxId = db.messages.reduce(function (m, x) { return Math.max(m, Number(String(x.id).replace('msg-', '')) || 0); }, 0);
  db.messages.push({
    id: 'msg-' + (maxId + 1),
    user_id: userId,
    type: 'order',
    title: title,
    content: content,
    is_read: false,
    created_at: util.nowText()
  });
}

function listMessagesMock(db, params, user) {
  let list = (db.messages || []).filter(function (m) { return m.user_id === user.id; });
  list = list.slice().sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  const unread = list.filter(function (m) { return !m.is_read; }).length;
  const pageSize = Math.max(1, parseInt(params.page_size, 10) || 20);
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize);
  return {
    items: items,
    total: list.length,
    unread_count: unread,
    page: page,
    page_size: pageSize
  };
}

function markMessageReadMock(db, id, user) {
  const msg = db.messages.find(function (m) { return String(m.id) === String(id); });
  if (!msg) fail(40401, '消息不存在');
  if (msg.user_id !== user.id) fail(40301, '无权操作该消息');
  msg.is_read = true;
  saveDB(db);
  return msg;
}

/** 我作为厨师收到的订单（mock：团队固定厨师==我 或 订单 chef_id==我） */
function chefOrdersMock(db, user) {
  const fixedTeamIds = db.teams
    .filter(function (t) { return t.chef_id === user.id; })
    .map(function (t) { return t.id; });
  const active = ['pending', 'accepted', 'cooking', 'ready'];
  const list = db.orders.filter(function (o) {
    if (active.indexOf(o.status) < 0) return false;
    return fixedTeamIds.indexOf(o.team_id) >= 0 || o.chef_id === user.id;
  });
  list.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  return {
    total: list.length,
    items: list.map(function (o) {
      return Object.assign({}, o, {
        user: {
          id: o.user_id,
          nickname: o.user_nickname || '',
          avatar: o.user_avatar || '👤'
        }
      });
    })
  };
}

/** 按菜聚合 + 食材汇总（基于待做订单） */
function chefAggregatedMock(db, user) {
  const chef = chefOrdersMock(db, user);
  const dishById = {};
  db.dishes.forEach(function (d) { dishById[d.id] = d; });
  const dishQty = {};
  const dishMeta = {};
  chef.items.forEach(function (o) {
    (o.items || []).forEach(function (it) {
      dishQty[it.name] = (dishQty[it.name] || 0) + it.quantity;
      const dish = dishById[it.dish_id];
      dishMeta[it.name] = dish && Array.isArray(dish.ingredients) ? dish.ingredients : [];
    });
  });
  const dishesPayload = Object.keys(dishQty)
    .map(function (name) {
      return {
        dish_name: name,
        emoji: (dishMeta[name].length ? name : '') && '',
        total_quantity: dishQty[name],
        ingredients: dishMeta[name]
      };
    })
    .sort(function (a, b) { return b.total_quantity - a.total_quantity; });
  // 补 emoji：从订单 items 快照里反查
  const emojiByName = {};
  chef.items.forEach(function (o) {
    (o.items || []).forEach(function (it) { emojiByName[it.name] = it.emoji; });
  });
  dishesPayload.forEach(function (d) { d.emoji = emojiByName[d.dish_name] || '🍽'; });
  const ingCount = {};
  dishesPayload.forEach(function (d) {
    (d.ingredients || []).forEach(function (name) {
      ingCount[name] = (ingCount[name] || 0) + 1;
    });
  });
  return {
    orders_count: chef.total,
    dishes: dishesPayload,
    ingredients: Object.keys(ingCount).map(function (name) {
      return { name: name, count: ingCount[name] };
    })
  };
}

/** 团队购物车快照（与 ws.js 的 mock 房间同源） */
function teamCartMock(db, teamId) {
  const ws = require('./ws');
  const items = ws._mockRoomItems(String(teamId));
  return { team_id: teamId, items: items };
}

/* =====================================================
 * 路由分发
 * ===================================================== */

function dispatch(options) {
  const url = options.url || '';
  const method = (options.method || 'GET').toUpperCase();
  const data = options.data || {};
  const parsed = parseUrl(url);
  const path = parsed.path.replace(/\/+$/, '') || '/';
  const params = parsed.params;
  const db = loadDB();

  // —— 无需鉴权 ——
  if (method === 'POST' && path === '/auth/guest') return ok(guestLogin(db));
  if (method === 'POST' && path === '/auth/wx-login') return ok(guestLogin(db));
  if (method === 'GET' && path === '/categories') return ok(listCategories(db));
  if (method === 'GET' && path === '/dishes') return ok(listDishes(db, params));

  // —— 需要登录（mock 自动兜底游客身份）——
  const user = ensureUser(db);

  if (method === 'GET' && path === '/me') return ok(mePayload(db, user));

  // —— 四期：收藏（优先于菜品详情匹配）——
  let m = /^\/dishes\/([^/]+)\/favorite$/.exec(path);
  if (m && method === 'POST') return ok(favoriteDish(db, m[1], user));
  if (m && method === 'DELETE') return ok(unfavoriteDish(db, m[1], user));

  // —— 四期：收藏列表 ——
  if (method === 'GET' && path === '/favorites') return ok(listFavorites(db, params, user));

  // —— 四期：菜谱库 ——
  if (method === 'GET' && path === '/recipes') return ok(listRecipes(db, params, user));
  if (method === 'POST' && path === '/recipes') return ok(createRecipe(db, data, user));

  m = /^\/recipes\/([^/]+)$/.exec(path);
  if (m && method === 'GET') return ok(getRecipe(db, m[1], user));
  if (m && method === 'PUT') return ok(updateRecipe(db, m[1], data, user));
  if (m && method === 'DELETE') return ok(deleteRecipe(db, m[1], user));

  // —— 四期：厨房冰箱 / 菜篮 ——
  if (method === 'GET' && path === '/fridge') return ok(listFridge(db, user));
  if (method === 'POST' && path === '/fridge') return ok(upsertFridge(db, data, user));
  if (method === 'GET' && path === '/fridge/suggest') return ok(fridgeSuggest(db, user));

  m = /^\/fridge\/([^/]+)$/.exec(path);
  if (m && method === 'DELETE') return ok(deleteFridge(db, m[1], user));

  if (method === 'GET' && path === '/basket') return ok(listBasket(db, user));
  if (method === 'POST' && path === '/basket') return ok(upsertBasket(db, data, user));

  m = /^\/basket\/([^/]+)$/.exec(path);
  if (m && method === 'PUT') return ok(checkBasket(db, m[1], data, user));
  if (m && method === 'DELETE') return ok(deleteBasket(db, m[1], user));

  m = /^\/dishes\/([^/]+)$/.exec(path);
  if (m && method === 'GET') return ok(dishDetail(db, m[1]));

  if (method === 'POST' && path === '/teams') return ok(createTeam(db, data, user));
  if (method === 'POST' && path === '/teams/join') return ok(joinTeam(db, data, user));

  m = /^\/teams\/([^/]+)$/.exec(path);
  if (m && method === 'GET') return ok(teamDetail(db, m[1], user));

  m = /^\/teams\/([^/]+)\/chef$/.exec(path);
  if (m && method === 'PUT') return ok(setTeamChef(db, m[1], data, user));

  m = /^\/teams\/([^/]+)\/cart$/.exec(path);
  if (m && method === 'GET') return ok(teamCartMock(db, m[1], user));

  if (method === 'GET' && path === '/chef/orders') return ok(chefOrdersMock(db, user));
  if (method === 'GET' && path === '/chef/orders/aggregated') return ok(chefAggregatedMock(db, user));

  if (method === 'GET' && path === '/messages') return ok(listMessagesMock(db, params, user));

  m = /^\/messages\/([^/]+)\/read$/.exec(path);
  if (m && method === 'POST') return ok(markMessageReadMock(db, m[1], user));

  if (method === 'GET' && path === '/orders') return ok(listOrders(db, params, user));
  if (method === 'POST' && path === '/orders') return ok(createOrder(db, data, user));

  m = /^\/orders\/([^/]+)$/.exec(path);
  if (m && method === 'GET') return ok(findOrder(db, m[1], user));

  m = /^\/orders\/([^/]+)\/accept$/.exec(path);
  if (m && method === 'POST') return ok(acceptOrder(db, m[1], user));

  m = /^\/orders\/([^/]+)\/status$/.exec(path);
  if (m && method === 'POST') return ok(updateOrderStatus(db, m[1], data, user));

  m = /^\/orders\/([^/]+)\/claim$/.exec(path);
  if (m && method === 'POST') return ok(claimOrder(db, m[1], user));

  fail(40400, '未知接口: ' + method + ' ' + path);
}

/* =====================================================
 * 对外暴露（与 utils/request.js 的 Promise 契约一致：
 * 成功 resolve 解包后的 data；业务失败 reject Error(msg)
 * ===================================================== */

function request(options) {
  return new Promise(function (resolve, reject) {
    let res;
    try {
      res = dispatch(options);
    } catch (e) {
      reject(e);
      return;
    }
    if (res && res.code === 0) {
      resolve(res.data);
    } else {
      const e = new Error((res && res.message) || '请求失败');
      e.code = res ? res.code : -1;
      reject(e);
    }
  });
}

module.exports = {
  request: request,
  // 便于测试/排查（页面不应直接调用）
  _dispatch: dispatch,
  _seed: seedDB
};