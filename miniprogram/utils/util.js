'use strict';

/**
 * 通用工具函数（无小程序 API 依赖，可在 Node 下直接单测）
 */

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 金额：保留两位小数，输出如 28.00 */
function formatPrice(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return '0.00';
  return num.toFixed(2);
}

/** 任意输入 → Date（兼容 iOS 无 - 的日期字符串解析） */
function toDate(input) {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);
  if (typeof input === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
      const d = new Date(input.replace(/-/g, '/'));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const t = Date.parse(input);
    return t ? new Date(t) : null;
  }
  return null;
}

/** 时间格式化：YYYY-MM-DD HH:mm */
function formatTime(input) {
  const d = toDate(input);
  if (!d) return input ? String(input) : '';
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** 当前时间文本：YYYY-MM-DD HH:mm:ss */
function nowText() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

/** 当前日期文本：YYYY-MM-DD */
function todayText() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** 随机 n 位数字码（默认 8 位，用于标识码/取餐邀请等） */
function randomCode(len) {
  const n = len || 8;
  let s = '';
  const chars = '0123456789';
  for (let i = 0; i < n; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/** 深拷贝（JSON 安全对象） */
function deepCopy(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    return obj;
  }
}

module.exports = {
  formatPrice: formatPrice,
  formatTime: formatTime,
  nowText: nowText,
  todayText: todayText,
  randomCode: randomCode,
  deepCopy: deepCopy
};