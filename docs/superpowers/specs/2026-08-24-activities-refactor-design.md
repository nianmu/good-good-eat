# 活动重构设计（Activities Refactor）— 好好吃饭

> 日期：2026-08-24
> 状态：待评审
> 上游：01-功能规划.md / 02-开发规划.md / 头脑风暴 7 节确认
> 目标：将“按人·订单”重构为“按餐·活动”，支撑聚餐/日常两类一餐的协同点菜、食材汇总、单菜认领/改厨师与单菜进度。

---

## 1. 目标与边界

- **一句话**：一次活动内多人点菜、汇总食材、单菜认领/改厨师、单菜进度推进，两种类型仅在食材联动上分流。
- **范围**：新建活动子系统（模型/接口/页面/WS），团队保留；旧 `orders/order_items` 逻辑下线，历史可丢弃或一次性导入为已完成活动；`fridge` 保留仅日常联动。
- **非目标**：支付、外卖、库存扣减、跨团队选人（活动归属单 `team_id`）；人数仅展示不限流。

---

## 2. 数据模型（推翻式）

### teams 增强
- `teams(id, name, description TEXT NULL, invite_code, owner_id, chef_id NULL, created_at)`
- `description` 非必填，创建时可选。

### team_members 增强
- `team_members(id, team_id, user_id, role ENUM('organizer','member'))`
- 支持：成员 `POST /teams/{id}/leave` 自退；组织者 `DELETE /teams/{id}/members/{user_id}` 删成员。

### activities（一餐）
- `id, team_id→teams, type ENUM('daily','party'), name, status ENUM('ordering','preparing','cooking','completed'), people INT NULL, remark TEXT NULL, created_by→users, created_at, updated_at`
- 索引：`team_id, status`

### activity_items（菜粒度）
- `id, activity_id→activities, dish_id→dishes, quantity INT, added_by→users, chef_id→users NULL, status ENUM('pending','prepared','cooking','done'), added_at`
- `chef_id` 默认 NULL → 前端显示“默认·团队固定厨师”，显式写入则覆盖，`NULL` 清空回落。
- 约束：`UNIQUE(activity_id, dish_id, added_by)` 防同人重复点同菜，数量累加；不同人点同菜各一行，便于“谁点的”。

### 保留
- `dishes, fridge` 保留；食材标签复用 `dish.ingredients JSON` 聚合，不另建表。
- 旧 `orders` 封存，必要时脚本导入为 `completed` 活动。

---

## 3. 状态机与流程

### 活动级 `activities.status` 单向
```
ordering(下单中) —[二次确认]→ preparing(备菜中) —[二次确认]→ cooking(制作中) —[全部菜done]→ completed
```
- `ordering`：成员 `POST .../items` 点菜，WS `activity.item_added` 实时同屏；菜品可跳详情。
- `preparing`：三模块：①进度（活动进度条）、②所有菜品（菜名×数量、谁点的→可跳菜品详情、厨师“默认·张三/我”可改）、③食材汇总（标签：日常`fridge`有则高亮无则置灰，聚餐独立；缺口数标红）。底部“开始制作”：日常缺食材二次弹“食材不足是否继续？”，聚餐仅提示“X道未备齐”。
- `cooking`：`item.chef_id` 可 `pending→prepared→cooking→done` 单菜推进；`改我为厨师` 任意成员可点。
- `completed`：归档，可“再来一餐 / 存为菜谱”。

**二次确认**：所有活动级流转前端均 `showModal` 二次弹，后端仍 `40003` 校验非法流转。

### 菜级 `activity_items.status`
- `pending→prepared→cooking→done`，仅 `item.chef_id`（或回落的 `team.chef_id`）可推。

### WS 事件
- `activity.item_added/removed/chef_changed/status_changed`, `activity.status_changed` 广播至 `team_id` 房间。

---

## 4. 接口（REST + WS）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/activities` `{team_id*, type, name, people?, remark?}` | 创建活动（必选团队） |
| GET | `/activities?team_id&status&page` | 团队活动列表 |
| GET | `/activities/{id}` | 详情（含 `members, items[], ingredients[{name,has}], progress`） |
| POST | `/activities/{id}/status {target}` | 活动流转（二次确认后） |
| POST | `/activities/{id}/items {dish_id, quantity}` | 点菜 |
| DELETE | `/activities/{id}/items/{item_id}` | 移除 |
| PUT | `/activities/{id}/items/{item_id}/chef {user_id|null}` | 改厨师（null回默认） |
| PUT | `/activities/{id}/items/{item_id}/status {target}` | 单菜推进 |
| POST | `/teams` `{name, description?}` | 创建团队（增强） |
| POST | `/teams/{id}/leave` | 成员自退 |
| DELETE | `/teams/{id}/members/{user_id}` | 组织者删成员 |
| WS | `/ws/team/{teamId}?token` | 复用房间，`activity.*`/`item.*` |

---

## 5. 前端页面

- **新建活动**（菜单“发起聚餐/日常”）：选团队* + 类型 + 人数(不限) + 名称 → `POST /activities` → 跳详情。
- **活动详情 `pages/activity-detail/index`**：三态复用；进度条+成员头像行+菜品卡（谁点的→跳详情，厨师可改）+食材标签（日常联动`fridge`）；底部动作均二次弹窗。
- **活动列表 `pages/activities/index`**：替代原订单 Tab，按团队筛。
- **迁移**：`menu/cart` 的“下单”改为“加入活动”（无 `ordering` 则先创建）；`chef-board` 下线改为活动内“我的待做”筛；团队切换下拉已做。

---

## 6. 权限与实时

- **权限**：`team_members` 为准，团队外不可见；点菜/改自己为厨师任一成员可为；活动流转需二次确认，`preparing→cooking` 建议组织者/厨师。
- **实时**：`broadcast_sync` 至 `team_id` 房间，`activity-detail` 按 `activity_id` 过滤刷新；断线 3s 指数重连 + `seq` 补拉。

---

## 7. 迁移与测试

- **迁移**：`teams.description` 新增列；新建 `activities/activity_items`；旧 `orders` 封存。
- **测试**：活动流转二次确认、单菜改厨师回落、日常 `fridge` 置灰、并发 `item.status` 行锁；H5 三态 + WS 实时 + 团队必选。
