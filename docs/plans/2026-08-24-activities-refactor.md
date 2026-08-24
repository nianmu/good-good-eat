# 活动重构（Activities Refactor）Implementation Plan

> **For Hermes:** Use implementation-pipeline skill to implement this plan task-by-task.

**Goal:** 将“按人下单”重构为“按餐活动”，一次活动内多人点菜、食材汇总（日常联动 fridge）、单菜认领/改厨师与单菜进度，支撑聚餐/日常两类一餐。
**Architecture:** 新增 `activities` + `activity_items` 为主表，`teams` 增强 `description`，活动状态 `ordering→preparing→cooking→completed` 单向流转（二次确认），菜级独立流转，WS 复用 `/ws/team/{teamId}` 广播。
**Tech Stack:** FastAPI + SQLAlchemy 2.0 (pymysql) + Alembic, Taro 4 + React + NutUI, MySQL8, WebSocket.

---

### Task 1: Alembic 迁移 — teams.description + activities/activity_items

**Objective:** 创建可推翻式新表结构。

**Files:**
- Create: `server/alembic/versions/xxxx_add_activities.py`
- Test: `server/tests/test_activities.py` (占位)

**Step 1: 编写迁移**
```python
# server/alembic/versions/xxxx_add_activities.py
def upgrade():
  op.add_column('teams', sa.Column('description', sa.Text(), nullable=True))
  op.create_table('activities',
    sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
    sa.Column('team_id', sa.BigInteger(), sa.ForeignKey('teams.id'), nullable=False, index=True),
    sa.Column('type', sa.Enum('daily','party', name='activity_type'), nullable=False),
    sa.Column('name', sa.String(64), nullable=False),
    sa.Column('status', sa.Enum('ordering','preparing','cooking','completed', name='activity_status'), nullable=False, server_default='ordering'),
    sa.Column('people', sa.Integer(), nullable=True),
    sa.Column('remark', sa.Text(), nullable=True),
    sa.Column('created_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
  )
  op.create_table('activity_items',
    sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
    sa.Column('activity_id', sa.BigInteger(), sa.ForeignKey('activities.id'), nullable=False, index=True),
    sa.Column('dish_id', sa.BigInteger(), sa.ForeignKey('dishes.id'), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('added_by', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=False),
    sa.Column('chef_id', sa.BigInteger(), sa.ForeignKey('users.id'), nullable=True),
    sa.Column('status', sa.Enum('pending','prepared','cooking','done', name='item_status'), nullable=False, server_default='pending'),
    sa.UniqueConstraint('activity_id','dish_id','added_by', name='uq_activity_item'),
  )
```

**Step 2: 运行**
Run: `uv run alembic upgrade head` (在 `server/`)
Expected: `OK` 且 `SHOW TABLES` 见新表

**Step 3: Commit**
```bash
git add server/alembic/versions/xxxx_add_activities.py
git commit -m "feat(db): add activities/activity_items + teams.description"
```

---

### Task 2: ORM 模型 Activity / ActivityItem

**Files:**
- Create: `server/app/models/activity.py`
- Modify: `server/app/models/__init__.py:1-15`

**Step 1: 模型**
```python
class Activity(Base): __tablename__="activities"; id...; team_id...; type...; name...; status...; people...; remark...; created_by...;
class ActivityItem(Base): __tablename__="activity_items"; ...
```

**Step 2: Verify**
Run: `python -c "from app.models.activity import Activity; print(Activity.__tablename__)"`
Expected: `activities`

**Step 3: Commit**
```bash
git add server/app/models/activity.py server/app/models/__init__.py
git commit -m "feat(model): Activity/ActivityItem"
```

---

### Task 3: teams.description 写入/回显

**Files:**
- Modify: `server/app/models/user.py:83` add `description` column
- Modify: `server/app/schemas/teams.py:8` add `description: str | None`
- Modify: `server/app/api/v1/teams.py:82` handle `description`

**Step 1: Schema + API**

**Step 2: Test**
Run: `pytest tests/test_teams.py -k test_create_team -v` 应 PASS（`description` 可空）

**Step 3: Commit**

---

### Task 4: 团队成员自退/组织者删成员

**Files:**
- Modify: `server/app/api/v1/teams.py:130` add `POST /teams/{id}/leave` + `DELETE /teams/{id}/members/{user_id}`

**Step 1: 实现**

**Step 2: Test**
Run: `pytest tests/test_teams.py -q` 全绿

**Step 3: Commit**

---

### Task 5: Activities CRUD + 状态流转（二次确认由前端保证，后端幂等）

**Files:**
- Create: `server/app/api/v1/activities.py`
- Modify: `server/app/api/v1/router.py:1` mount

**Step 1: 实现 `POST /activities`, `GET /activities`, `GET /activities/{id}`（含 members/items/ingredients{has} 计算，daily 时 `has = dish.ingredients ∩ fridge`）

**Step 2: 实现 `POST /activities/{id}/status` 单向 `ordering→preparing→cooking→completed`，`with_for_update` 行锁

**Step 3: Test**
Run: `pytest tests/test_activities.py::test_activity_flow -v` 预期 PASS

**Step 4: Commit**

---

### Task 6: ActivityItems 点菜/改厨师/单菜进度

**Files:**
- Modify: `server/app/api/v1/activities.py` add `POST .../items`, `DELETE .../items/{item_id}`, `PUT .../items/{item_id}/chef`, `PUT .../items/{item_id}/status`

**Step 1: 实现（`chef_id` null 回落 `team.chef_id`，`with_for_update` 防并发）

**Step 2: Test** `pytest tests/test_activities.py -k item -v`

**Step 3: Commit**

---

### Task 7: WS 广播（复用 team 房间）

**Files:**
- Modify: `server/app/api/v1/activities.py` after commit `manager.broadcast_sync(team_id, "activity.*")`
- Modify: `server/app/ws/handlers.py:1` 文档更新

**Step 1: 在创建/状态/单菜变更后 `broadcast_sync`**

**Step 2: Manual verify** 两个浏览器同团队，A 点菜 B 秒级出现

**Step 3: Commit**

---

### Task 8: 前端 API 封装

**Files:**
- Modify: `h5/src/api/index.ts:41` add `activities: {create, list, detail, updateStatus, addItem, removeItem, updateChef, updateItemStatus}` + `teams.leave/removeMember`

**Step 1: 实现**

**Step 2: Commit**

---

### Task 9: 活动列表页（替代订单 Tab）

**Files:**
- Create: `h5/src/pages/activities/index.tsx`
- Modify: `h5/src/app.config.ts:1` tabBar 指向 activities

**Step 1: 实现（团队筛、状态筛、WS 增量）**

**Step 2: Commit**

---

### Task 10: 活动详情页 三模块 + 二次确认

**Files:**
- Create: `h5/src/pages/activity-detail/index.tsx`

**Step 1: 实现 进度条（每次 `showModal` 确认）、本次成员、所有菜品（谁点的→跳 dish-detail，厨师改我）、食材标签（daily 置灰逻辑）

**Step 2: Commit**

---

### Task 11: 菜单/购物车迁移至活动

**Files:**
- Modify: `h5/src/pages/menu/index.tsx:275` “下单”改为“加入活动”（无 ordering 活动先创建）
- Modify: `h5/src/pages/cart/index.tsx:42` 同步写入 `activity_items`

**Step 1: 实现**

**Step 2: Commit**

---

### Task 12: 团队下拉与描述 UI

**Files:**
- Modify: `h5/src/pages/team-list/index.tsx:112` 加 `description` 输入
- Modify: `h5/src/pages/team-detail/index.tsx:99` 加描述展示、自退/删成员按钮

**Step 1: 实现**

**Step 2: Commit**

---

### Task 13: 旧订单下线与回归

**Files:**
- Modify: `h5/src/app.config.ts` 移除 orders tab（或保留归档）
- Test: `pytest -q` 全绿，H5 `useDidShow` 均二次确认

**Step 1: 删除/隐藏旧入口，保留后端归档查询

**Step 2: Commit**
