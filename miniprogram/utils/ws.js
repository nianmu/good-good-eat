'use strict';

/**
 * WebSocket 封装（第三期 · 团队房间实时）
 * ----------------------------------------
 * 协议（与本仓库 docs/02-开发规划.md §4.6 及本期指示一致）：
 * - 连接：ws://{host}/ws/team/{teamId}?token=<JWT>（本地开发 ws，生产 wss）
 * - 客户端发送：{"event":"join","data":{}} / cart.upsert / cart.clear / pong
 * - 服务端事件：joined / cart.snapshot / cart.upsert / member.joined /
 *   order.created / order.status_changed / ping
 *
 * 能力：
 * - 收到 ping 自动回 {"event":"pong"} 心跳；
 * - 断线指数退避重连（1s/2s/4s…上限 30s），重连成功自动重新 join 拉全量快照；
 * - 连接状态（closed/connecting/connected/reconnecting）通过
 *   onConnectionChange(fn) 回调通知（菜单页用来显示「已连接/重连中」小点）；
 * - useMock=true 时提供本地模拟：每个团队一个内存房间（可持久化到 wx storage），
 *   客户端内事件总线广播（同一页面内多订阅者共享），模拟关键事件流转：
 *   join → joined + cart.snapshot、本地 cart 变化（send cart.upsert）回声、
 *   首次进房模拟 member.joined 等，单设备即可演示完整多人流程。
 */

const config = require('./config');
const store = require('./store');

const ROOMS_KEY = 'ggc:mock:wsrooms';
const MOCK_NAMES = { 'user-mom': '妈妈', 'user-other': '老王', 'user-f1': '饭友1' };

/* ================= 模块级状态 ================= */
let currentTeam = null;      // 当前房间 teamId
let connStatus = 'closed';   // closed | connecting | connected | reconnecting
let socketTask = null;       // 真实模式下 SocketTask
let reconnectTimer = null;
let reconnectAttempt = 0;
let manuallyClosed = false;
let mockJoinTimer = null;

const listeners = {};        // event -> [cb]
const stateCbs = [];         // 连接状态回调

const mockRooms = {};        // teamId -> { items, names, joined, _seedDone, _firstJoin }

/* ================= 工具 ================= */

function emit(event, data) {
  const cbs = (listeners[event] || []).slice();
  for (let i = 0; i < cbs.length; i++) {
    try { cbs[i](data); } catch (e) { /* 单个订阅者异常不影响其他 */ }
  }
}

function notifyState() {
  const s = { teamId: currentTeam, status: connStatus };
  stateCbs.slice().forEach(function (fn) {
    try { fn(s); } catch (e) { /* ignore */ }
  });
}

function setStatus(status) {
  connStatus = status;
  notifyState();
}

function currentUserId() {
  const u = store.get('user') || {};
  return u.id || 'guest';
}

function currentNickname() {
  const u = store.get('user') || {};
  return u.nickname || '我';
}

/* ================= 真实模式 ================= */

function buildWsUrl(teamId) {
  const m = /^(https?):\/\/([^/]+)/.exec(config.baseUrl || '');
  const host = m ? m[2] : '127.0.0.1:8000';
  const proto = m && m[1] === 'https' ? 'wss' : 'ws';
  return proto + '://' + host + '/ws/team/' + encodeURIComponent(teamId) +
    '?token=' + encodeURIComponent(store.get('token') || '');
}

function openSocket() {
  if (!currentTeam || manuallyClosed) return;
  setStatus('connecting');
  let task;
  try {
    task = wx.connectSocket({ url: buildWsUrl(currentTeam) });
  } catch (e) {
    scheduleReconnect();
    return;
  }
  socketTask = task;

  task.onOpen(function () {
    if (!socketTask) return;
    reconnectAttempt = 0;
    setStatus('connected');
    send({ event: 'join', data: {} });
  });

  task.onMessage(function (res) {
    let msg = null;
    try { msg = JSON.parse(res.data || '{}'); } catch (e) { return; }
    if (!msg || !msg.event) return;
    if (msg.event === 'ping') {
      send({ event: 'pong', data: {} });
      return;
    }
    emit(msg.event, msg.data || {});
  });

  task.onError(function () {
    setStatus('reconnecting');
  });

  task.onClose(function () {
    socketTask = null;
    if (!manuallyClosed && currentTeam) {
      scheduleReconnect();
    } else {
      setStatus('closed');
    }
  });
}

function scheduleReconnect() {
  if (manuallyClosed || !currentTeam) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000); // 1s/2s/4s…上限 30s
  reconnectAttempt++;
  setStatus('reconnecting');
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    openSocket();
  }, delay);
}

function closeSocketNow() {
  manuallyClosed = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (socketTask) {
    try { socketTask.close({}); } catch (e) { /* ignore */ }
    socketTask = null;
  }
}

/* ================= Mock 本地模拟 ================= */

function loadMockRooms() {
  try {
    const raw = wx.getStorageSync(ROOMS_KEY);
    if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (tid) {
        const r = raw[tid];
        if (!r || !Array.isArray(r.items)) return;
        mockRooms[tid] = {
          items: r.items,
          names: Object.assign({}, MOCK_NAMES, r.names || {}),
          joined: r.joined || {},
          _seedDone: !!r._seedDone,
          _firstJoin: !!r._firstJoin
        };
      });
    }
  } catch (e) { /* ignore */ }
}

function saveMockRooms() {
  try {
    const out = {};
    Object.keys(mockRooms).forEach(function (tid) {
      const r = mockRooms[tid];
      out[tid] = {
        items: r.items,
        names: r.names,
        joined: r.joined,
        _seedDone: r._seedDone,
        _firstJoin: r._firstJoin
      };
    });
    wx.setStorageSync(ROOMS_KEY, out);
  } catch (e) { /* ignore */ }
}

/** 首次进房时模拟「其他成员已点了菜」：让 N 人已点 / 团队合计开箱可见 */
function seedMockRoom(room) {
  if (room._seedDone) return;
  room._seedDone = true;
  room.items = [
    { dish_id: 'dish-1', quantity: 2, user_ids: ['user-mom'] },
    { dish_id: 'dish-5', quantity: 1, user_ids: ['user-other'] },
    { dish_id: 'dish-13', quantity: 2, user_ids: ['user-mom'] }
  ];
  saveMockRooms();
}

function ensureMockRoom(teamId) {
  if (!mockRooms[teamId]) {
    mockRooms[teamId] = {
      items: [],
      names: Object.assign({}, MOCK_NAMES),
      joined: {},
      _seedDone: false,
      _firstJoin: true
    };
  }
  seedMockRoom(mockRooms[teamId]);
  return mockRooms[teamId];
}

/** 序列化房间快照 items（GET /teams/{id}/cart 与 cart.snapshot 共用） */
function mockRoomItems(teamId) {
  const room = ensureMockRoom(teamId);
  return (room.items || []).map(function (i) {
    return {
      dish_id: i.dish_id,
      quantity: i.quantity,
      user_ids: (i.user_ids || []).slice()
    };
  });
}

/** 服务端语义的 cart.upsert：更新房间并回声给订阅者 */
function applyMockUpsert(room, data) {
  const uid = data.user_id || currentUserId();
  const nick = data.nickname || currentNickname();
  const action = data.action || 'set';
  const dishId = data.dish_id;
  if (!dishId) return;

  let item = null;
  for (let i = 0; i < room.items.length; i++) {
    if (room.items[i].dish_id === dishId) { item = room.items[i]; break; }
  }

  if (action === 'plus') {
    if (item) {
      item.quantity += 1;
      if (item.user_ids.indexOf(uid) < 0) item.user_ids.push(uid);
    } else {
      room.items.push({ dish_id: dishId, quantity: 1, user_ids: [uid] });
    }
  } else if (action === 'set') {
    const qty = Math.max(1, parseInt(data.quantity, 10) || 1);
    if (item) {
      item.quantity = qty;
      if (item.user_ids.indexOf(uid) < 0) item.user_ids.push(uid);
    } else {
      room.items.push({ dish_id: dishId, quantity: qty, user_ids: [uid] });
    }
  } else { // minus
    if (item) {
      item.quantity -= 1;
      if (item.quantity <= 0) {
        room.items = room.items.filter(function (x) { return x.dish_id !== dishId; });
      }
    }
  }

  room.names[uid] = nick;
  room.joined[uid] = true;
  saveMockRooms();

  let total = 0;
  for (let i = 0; i < room.items.length; i++) {
    if (room.items[i].dish_id === dishId) { total = room.items[i].quantity; break; }
  }
  emit('cart.upsert', {
    dish_id: dishId,
    quantity: total,
    user_id: uid,
    nickname: nick,
    action: action,
    total_quantity: total
  });
}

function mockConnect(teamId) {
  if (currentTeam === teamId && connStatus === 'connected') {
    // 重新 join：补发 joined + 全量快照（新订阅的页面可重建）
    emit('joined', {});
    emit('cart.snapshot', { items: mockRoomItems(teamId) });
    return;
  }
  if (mockJoinTimer) { clearTimeout(mockJoinTimer); mockJoinTimer = null; }
  currentTeam = teamId;
  manuallyClosed = false;
  setStatus('connecting');
  const room = ensureMockRoom(teamId);
  setStatus('connected');
  emit('joined', {});
  emit('cart.snapshot', { items: mockRoomItems(teamId) });
  if (room._firstJoin) {
    room._firstJoin = false;
    saveMockRooms();
    // 模拟另一位成员稍后加入房间（演示 member.joined toast）
    mockJoinTimer = setTimeout(function () {
      mockJoinTimer = null;
      if (currentTeam !== teamId) return;
      emit('member.joined', { user_id: 'user-f1', nickname: '饭友1' });
    }, 1600);
  }
}

function mockSend(obj) {
  if (!obj || !obj.event || !currentTeam) return;
  const room = ensureMockRoom(currentTeam);
  const event = obj.event;
  const data = obj.data || {};
  if (event === 'join') {
    emit('joined', {});
    emit('cart.snapshot', { items: mockRoomItems(currentTeam) });
  } else if (event === 'cart.upsert') {
    applyMockUpsert(room, data);
  } else if (event === 'cart.clear') {
    room.items = [];
    saveMockRooms();
    emit('cart.snapshot', { items: [] });
  }
  // pong 等无需本地处理
}

/* ================= 对外 API ================= */

function connect(teamId) {
  if (!teamId) {
    close();
    return;
  }
  teamId = String(teamId);
  if (config.useMock) {
    mockConnect(teamId);
    return;
  }
  if (currentTeam === teamId && socketTask && connStatus === 'connected') {
    send({ event: 'join', data: {} }); // 补拉一次全量快照
    return;
  }
  if (currentTeam && currentTeam !== teamId) closeSocketNow();
  currentTeam = teamId;
  manuallyClosed = false;
  reconnectAttempt = 0;
  openSocket();
}

function close() {
  if (config.useMock) {
    if (mockJoinTimer) { clearTimeout(mockJoinTimer); mockJoinTimer = null; }
    currentTeam = null;
    setStatus('closed');
    return;
  }
  closeSocketNow();
  currentTeam = null;
  setStatus('closed');
}

function send(obj) {
  if (!obj) return;
  if (config.useMock) {
    mockSend(obj);
    return;
  }
  if (!socketTask || connStatus !== 'connected') return; // 未连接时静默丢弃，重连后以 snapshot 补齐
  try {
    socketTask.send({ data: JSON.stringify(obj) });
  } catch (e) { /* ignore */ }
}

/** 订阅服务端事件：on(event, cb)；返回 cb 便于 off */
function on(event, cb) {
  if (!listeners[event]) listeners[event] = [];
  if (listeners[event].indexOf(cb) < 0) listeners[event].push(cb);
  return cb;
}

function off(event, cb) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(function (x) { return x !== cb; });
}

/** 订阅连接状态变化：fn({teamId, status})；返回 fn 便于取消 */
function onConnectionChange(fn) {
  if (stateCbs.indexOf(fn) < 0) stateCbs.push(fn);
  return fn;
}

function offConnectionChange(fn) {
  const i = stateCbs.indexOf(fn);
  if (i >= 0) stateCbs.splice(i, 1);
}

function getState() {
  return { teamId: currentTeam, status: connStatus };
}

/** 状态文案（页面展示用） */
function statusLabel(status) {
  const map = {
    connected: '已连接',
    connecting: '连接中',
    reconnecting: '重连中',
    closed: '未连接'
  };
  return map[status] || '未连接';
}

/* ===== 供 mock 数据层使用的内部钩子（页面不应调用） ===== */

/** 模拟服务端主动推送（order.created / order.status_changed 等） */
function _mockEmit(teamId, event, data) {
  if (!config.useMock) return;
  if (!currentTeam || String(currentTeam) !== String(teamId)) return; // 仅当前房间可见
  emit(event, data || {});
}

/** 读取团队房间快照 items（GET /teams/{id}/cart / chef 聚合使用） */
function _mockRoomItems(teamId) {
  if (!config.useMock) return [];
  return mockRoomItems(teamId);
}

if (typeof wx !== 'undefined') loadMockRooms();

module.exports = {
  connect: connect,
  close: close,
  send: send,
  on: on,
  off: off,
  onConnectionChange: onConnectionChange,
  offConnectionChange: offConnectionChange,
  getState: getState,
  statusLabel: statusLabel,
  _mockEmit: _mockEmit,
  _mockRoomItems: _mockRoomItems
};