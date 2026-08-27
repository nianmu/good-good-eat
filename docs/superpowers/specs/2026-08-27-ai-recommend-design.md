# AI 智能推荐功能设计

- 日期：2026-08-27
- 分支：`feature/ai-recommend`
- 状态：待实现

## 1. 背景与目标

为「好好吃饭」（Taro H5 + FastAPI 后端）接入 AI 推荐能力：

1. **对话式每餐推荐**：用户可通过多轮对话让 AI 结合其菜单里的真实菜品推荐一桌菜。
2. **冰箱食材分析**：AI 可结合用户冰箱现有食材推荐能做的菜。
3. **结构化 + 一键加购**：AI 输出同时含「展示文本」与「可加购菜品（真实 dish_id）」，前端以多选框勾选后加入购物车。

## 2. 已确认的决策

| 决策 | 结论 |
|---|---|
| AI 服务 | **通用 OpenAI 兼容接口**，`base_url/model/api_key` 走 `.env`，不绑定单一厂商 |
| 对话历史 | **不落库**，前端页面内存维护，刷新清空 |
| 返回方式 | **SSE 流式**（打字机效果）；H5 用 `fetch`+`ReadableStream`，微信小程序用 `Taro.request({enableChunked:true})`+`onChunkReceived`（官方支持，见调研） |
| 冰箱入口 | 不单独建页；每次请求**全量注入**当前用户冰箱食材上下文 |
| 上下文规模 | **全量喂**（当前 372 道菜 + 食材约 52KB，无压力）；菜单只取轻量列，不拉食材大字段 |
| 结构化手段 | **工具调用（function calling）** 返回 `dish_ids`；所有 AI 服务均支持 |
| 加购落库 | **不落库**，复用现有本地购物车 `store.setCartQuantity` → `ggc_cart`（与从菜谱/详情页加购一致） |

## 3. 架构总览

```
前端 ai-chat 页 ──POST /api/v1/ai/chat (SSE)──▶ 后端 ai.py ──▶ ai_service.py
                                                   │            ├─ build_context()  可见菜品 + 冰箱食材
                                                   │            └─ stream_chat()    工具调用 + httpx 流式
                                                   │                                   │
                                                   │            OpenAI 兼容 /v1/chat/completions
                                                   ▼
   前端打字机渲染 text ── dishes 事件 ──▶ 多选框 ──▶ 加入购物车(store.setCartQuantity)
```

## 4. 后端设计（server/）

### 4.1 配置 `app/core/config.py`
新增字段（均读 `.env`）：
- `ai_base_url: str = "https://api.openai.com/v1"`
- `ai_model: str = ""`
- `ai_api_key: str = ""`（为空 → 功能禁用，SSE 返回 error 事件）

### 4.2 服务 `app/services/ai_service.py`
- `build_context(db, user) -> str`：拼接系统提示
  - 菜单：`select(Dish.id, Dish.name, Dish.category_id, Dish.emoji, Dish.price)` + `visible_dish_conds`，仅轻量列
  - 冰箱：`select(FridgeItem.name)`（含 quantity）
- `build_system_prompt(context) -> str`：规定输出格式、只推荐菜单里的菜、dish_id 必须是列表中出现过的
- `stream_chat(messages, context) -> AsyncIterator[str]`：
  - httpx `AsyncClient` 调 `${base_url}/chat/completions`，`stream=True`
  - 携带 `tools`（`recommend_dishes` 工具 schema）+ `tool_choice:"auto"`
  - 产出两种流：
    - 文本 delta（`delta.content`）
    - 工具调用参数增量（`delta.tool_calls[].function.arguments`），累积后解析出 `dish_ids`

### 4.3 路由 `app/api/v1/ai.py`
`POST /ai/chat`（SSE，`StreamingResponse`）：
- 入参 `{ messages: [{role, content}] }`（校验 role∈system/user/assistant，长度上限）
- 鉴权：`get_current_user`（需登录）
- 构造消息：system(上下文) + 用户历史
- 逐事件 yield：
  - `data: {"type":"text","delta":"..."}`
  - 工具调用完成后：按 `dish_ids` 查 DB（`visible_dish` 过滤），组装 `data: {"type":"dishes","items":[{dish_id,name,emoji,price,quantity}]}`
  - 结束 `data: {"type":"done"}`
- 错误处理：无 `ai_api_key` → `data: {"type":"error","message":"AI 未配置"}`（HTTP 200 + SSE，便于前端统一处理）；上游超时/异常 → error 事件
- 注册进 `router.py`

### 4.4 测试 `tests/test_ai.py`
- mock `httpx` 流式响应（文本 + 工具调用）
- 验证：上下文包含可见菜品与冰箱食材；dish_id 仅下发真实可见的（幻觉 id 被过滤）；无 Key 时返回 error 事件；未登录 401

## 5. 前端设计（h5/）

### 5.1 统一流式客户端 `src/utils/ai-stream.ts`
- `streamChat(messages, { onDelta, onDishes, onDone, onError })`
- H5（`TARO_ENV==='h5'`）：`fetch(url, {method:'POST', headers:{Authorization,...}, body:JSON})` + `response.body.getReader()` 解析 SSE
- weapp：`Taro.request({enableChunked:true, responseType:'arraybuffer'})` + `task.onChunkReceived` 缓冲 + `TextDecoder` + 解析 SSE 行
- 统一调用方 API，屏蔽平台差异

### 5.2 页面 `src/pages/ai-chat/index`
- 消息列表：用户气泡 / AI 气泡
- AI 气泡 = 流式文本（打字机）+ 可选「菜品多选卡」
- 菜品多选卡：`dishes` 事件里的菜，每道 `Checkbox`（默认选中），底部「加入购物车」按钮 → `store.setCartQuantity(dish_id, qty)`（数量默认 1，可调）
- 会话数组仅 useState 内存
- `app.config.ts` 注册页面；菜单页加「AI 智能点菜」入口

### 5.3 契约对齐
SSE 事件：`text`/`dishes`/`done`/`error`（见后端 4.3）

## 6. 错误与降级
- 未配置 `ai_api_key`：error 事件，前端 toast「AI 功能未配置」
- 上游 4xx/5xx/超时：error 事件
- 工具调用未发生（模型只回文本）：只渲染文本，无菜品卡
- 单条消息过长/次数限制：前端输入长度限制 + 防连点

## 7. 测试与验证
- 后端：`pytest tests/test_ai.py`
- 前端：`tsc --noEmit`、`build:h5` 构建
- 手工：对话推荐 → 勾选菜品 → 加入购物车 → 购物车页可见

## 8. 交付物清单
- `server/app/services/ai_service.py`（新）
- `server/app/api/v1/ai.py`（新）
- `server/app/api/v1/router.py`（改）
- `server/app/core/config.py`（改）
- `server/tests/test_ai.py`（新）
- `h5/src/utils/ai-stream.ts`（新）
- `h5/src/pages/ai-chat/index.tsx` + config（新）
- `h5/src/app.config.ts`（改，注册页面）
- 菜单页入口（改）
