# 好好吃饭 · 微信小程序（miniprogram/）

原生四件套（WXML / WXSS / JS / JSON），**零 npm 依赖、无构建链**，微信开发者工具直接打开即可运行。

> 后端（FastAPI + MySQL8）由另一条线并行开发、接口尚未就绪。本工程内置 **USE_MOCK 模式**，
> 无任何后端也能完整跑通：`浏览菜品 → 加购物车 → 下单 → 取餐码 → 状态流转 → 订单列表/详情`。
> 接口契约与 `docs/02-开发规划.md` §4.4 完全一致，切换联调无需改页面代码。

---

## 一、微信开发者工具导入与预览步骤

1. **安装并打开微信开发者工具**（本机：`C:\Program Files (x86)\Tencent\微信web开发者工具`）
2. 登录后选择 **「导入项目」**（或「+」→ 导入）：目标是本目录 `miniprogram/`（import 的是含
   `project.config.json` 的那一层）。
3. AppID 使用 **`wx6056573ab9ee889b`**（已在 project.config.json 中预填）；如需自建测试号可在导入时选择「测试号」。
4. 导入后进入 **「详情 → 本地设置」**：确认 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**
   已勾选（`project.config.json` 的 `"urlCheck": false` 已默认关闭校验，通常无需手动操作）。
5. 编译运行，应看到底部 TabBar 四入口：**菜谱 / 订单 / 消息 / 我的**。

### 预览顺序（建议按此走查全流程）

1. **菜谱页**：左侧分类 + 右侧菜品；点菜品进详情；`+` / 加减加入购物车；试试「随机点菜」「下单」。
2. **菜品详情**：emoji 色块大图 / 食材 / 做法简述 / 评分 / 数量选择 → 加入购物车返回。
3. **购物车**：调数量 / 删除 / 选团队 → 提交下单 → 自动跳转订单详情（绿色取餐码大字）。
4. **订单详情**：五步状态条 → 主按钮依次推进：发送给厨师 → 开始制作 → 完成制作 → 确认取餐；
   「复制订单信息」把纯文本写入剪贴板；完成后「再次点菜」回菜谱。
5. **订单列表**：顶部状态筛选（全部/待接单/制作中/待取餐/已完成）、上拉触底分页加载、下拉刷新。
6. **我的**：用户信息 / 统计三格（「收藏」可点进收藏列表）/ 我的团队（点卡片进团队详情）/
   功能宫格（厨房管理/厨房冰箱/厨房菜篮/我的收藏 已接入，其余占位 toast）。
7. **团队页**：创建团队（输入名称）、加入团队（输入邀请码 —— 种子用户已加入前 3 个团队，
   可直接用第 4 个团队邀请码 `F0O0D4E2` 演示加入，或创建团队后复制新邀请码）。

### 第四期新增：菜谱库 / 厨房 / 收藏

8. **我的菜谱**（我的 → 厨房管理）：我的菜谱列表 + 右下角「＋」新建，进编辑页填名称/emoji/色块/
   描述/食材/步骤/耗时/难度 → 保存；点在列表进详情，本人可编辑/删除。
9. **厨房冰箱**（我的 → 厨房冰箱）：添加食材（同名覆盖数量）/ 删除；下方「冰箱能做的菜」推荐
   （按命中食材数排序，点进菜谱/菜品详情）。
10. **厨房菜篮**（我的 → 厨房菜篮）：添加待购项（同名合并）/ 点击勾选完成 / 取消勾选 / 删除。
11. **收藏**：菜谱页菜品卡片右上角 ♡ 收藏 / ♥ 取消收藏；「我的 → 我的收藏」查看列表并取消收藏。

> mock 数据会持久化到小程序本地缓存：订单状态推进、新建订单/团队等操作**刷新页面不会丢**。
> 想重置演示数据：开发者工具「清除缓存 → 清除数据缓存」后重新编译。

---

## 二、两种模式如何切换

### 1) Mock 模式（默认，零后端）

- 文件：`miniprogram/utils/config.js` → `useMock: true`
- 数据源：`miniprogram/utils/mock.js`，结构契约与真实后端一致
  （`{code, message, data}` 统一响应；`category_id / rating_count / cook_time / order_no /
  pickup_code / team_name / created_at / total_amount / total_count` 等 snake_case 字段）。
- 首次进入自动以种子演示用户（用户16tQW，含 3 笔订单 / 3 个团队 / 统计）完成游客登录，
  订单列表、我的页、团队页开箱即有内容；共 12 笔种子订单便于演示分页加载。

### 2) 联调模式（后端就绪后）

- 文件：`miniprogram/utils/config.js` → `useMock: false`
- 后端启动：`cd server && uvicorn app.main:app --host 0.0.0.0 --port 8000`
  （以实际后端文档为准）
- 请求自动走 `wx.request`：`Authorization: Bearer <token>` 注入、401 自动重新游客登录重试一次、
  统一解包 `{code,message,data}`、`code !== 0` 或非 2xx 时 reject 并提示。
- 建议先打开「调试器 → Network」观察请求是否符合契约。

### 3) 真机预览（手机上看真实效果）

1. 电脑与手机连**同一局域网**。
2. 打开终端查电脑局域网 IP（`ipconfig`，如 `192.168.1.100`）。
3. 改 `miniprogram/utils/config.js` 的 `baseUrl` 为 `http://192.168.1.100:8000/api/v1`
   （**不要用 127.0.0.1，手机访问不到**）。
4. 开发者工具「预览」生成二维码，手机微信扫码打开；
   仍需手机「开发版/体验版」模式下允许不校验域名（工具勾选后同车即可）。

---

## 三、工程结构

```
miniprogram/
  app.js / app.json / app.wxss     # 入口 / 页面注册 / 设计 token（对齐 prototype tokens.css）
  project.config.json              # appid=wx6056573ab9ee889b、urlCheck=false、libVersion 稳定版
  sitemap.json
  utils/
    config.js    # baseUrl / useMock 开关
    request.js   # Promise 封装：Bearer 注入、401 重试、统一解包、mock 分流
    mock.js      # mock 数据层：全部接口模拟 + 状态持久化（wx storage）
    store.js     # 轻量全局状态：user/token/cart + 变更通知
    util.js      # formatPrice / formatTime / 随机码 / 深拷贝
  components/
    dish-card / qty-stepper / status-chip / empty-state
  pages/
    menu/  dish-detail/  cart/  orders/  order-detail/
    messages/  profile/  team-list/  team-detail/
    recipe-list/  recipe-edit/  recipe-detail/   # 四期：菜谱库
    fridge/  basket/  favorites/                 # 四期：厨房 / 收藏
```

---

## 四、已知限制（诚实清单）

- **厨师操作权限**：真实后端会校验厨师角色（接单/流转），mock 中当前用户即种子用户、可推进任何
  自己的订单；联调时若接口返回 403，属预期权限行为。
- **订单归属**：mock 模式下所有新增订单挂到种子演示用户，便于演示；真实后端按 JWT 身份隔离。
- **邀请码/指定厨师**：创建/加入团队已可用；「指定厨师」「邀请链接分享」「厨师认领」为占位状态。
- **消息中心**：第四期仍为占位，无真实数据（后端已建 messages 表）。
- **公开菜谱库**：第四期只做「我的菜谱」（owner=me），GET /recipes?owner=public 返回 40020
  占位错误；公开菜谱推荐逻辑（is_public）已实现，后续开放公开库即可用。
- **菜谱不收藏**：本期收藏仅针对菜品（Dish 的 Favorite 表），菜谱收藏未做，避免过度设计。
- **图片**：菜品图统一用 emoji + 色块（原型同款降级方案），`image_url` 字段留白，后端提供真图后
  可在 `dish-card` / `dish-detail` 中替换为 `<image>`。
- **WebSocket / 实时购物车 / 厨师看板**：第三期范围，本期未新增。
- **baseUrl 真机注意事项**：详见上文「真机预览」。