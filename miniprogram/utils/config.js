'use strict';

/**
 * 全局配置
 * ----------------------------------------
 * useMock: true  —— 纯前端 mock 数据层（utils/mock.js 模拟后端），
 *                   无需任何后端即可在微信开发者工具里走通
 *                   浏览 → 加购 → 下单 → 订单详情 全流程。
 * useMock: false —— 联调真实后端（FastAPI，见 docs/02-开发规划.md §4.4）。
 *
 * ⚠️ 真机预览：微信开发者工具里「真机调试/预览」时手机访问不到电脑的
 *    127.0.0.1，必须把 baseUrl 改成电脑的局域网 IP，例如：
 *    http://192.168.1.100:8000/api/v1
 *    （保持第 8000 端口，后端 uvicorn 默认端口）。
 * ⚠️ 联调后端时需保证开发者工具「详情 → 本地设置 → 不校验合法域名…」
 *    处于勾选状态（project.config.json 中 urlCheck 已设为 false）。
 * ⚠️ 正式联调微信登录：后端 POST /auth/wx-login 依赖 wx.login code →
 *    code2session 换 openid，需在后端 .env 配置 WX_APPID（wx6056573ab9ee889b）
 *    与 WX_SECRET（用户尚未提供，后续补齐后由后端侧配置即可，前端无需改动）。
 *    在 WX_SECRET 配置之前，正式联调请保持走后端 /auth/guest 游客登录路径。
 */
const config = {
  baseUrl: 'http://127.0.0.1:8000/api/v1',
  useMock: false,
  // 默认分页大小（订单列表等分页接口使用）
  pageSize: 8
};

module.exports = config;