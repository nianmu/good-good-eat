# 菜品自建 + 可见性 + 菜谱打通设计（User Dishes & Visibility）

> 日期：2026-08-25
> 状态：待评审
> 上游：活动重构（activities-refactor）· 菜谱库（四期+最终版）
> 目标：让"一道菜 = 一份做法"成为完整闭环——用户可自建菜品并选择三种可见性（公开/团队公开/仅自己），自建菜谱可关联菜品，菜单与菜谱库同源。

---

## 1. 目标与边界

- **一句话**：用户能新增菜品（带做法），菜品按 公开/团队公开/仅自己 三种可见性分发；菜单列表、点菜、收藏、推荐只呈现当前用户可见的菜；菜谱库与菜单共用分类与数据源。
- **范围**：`dishes` 表加可见性字段与归属；`POST /dishes` 创建接口；所有读菜品入口加可见性过滤；`/recipes` 支持 `category_id` 与分类筛选；前端菜单页加入口、新建菜品页、菜谱库分类 Tab。
- **非目标**：审核流、菜品图片上传（沿用 emoji/色块）、菜品下架流程（沿用 is_active）、跨团队菜谱分享。

---

## 2. 数据模型（推翻式增量）

### dishes 增强
```python
class Dish(Base):
    ...既有字段...
    created_by: int | None          # NULL = 平台官方 seed
    visibility: Enum('public','team','private')  # 公开/团队公开/仅自己
    team_id: int | None             # 仅团队公开时填：创建时的团队
```
- 存量 seed 菜品：`created_by=NULL, visibility='public', team_id=NULL`（迁移回填）。
- `team_id` 记录"创建时选择的团队"；可见范围**动态跟随**：该团队当前所有成员可见，创建者离开团队后该团队成员不再可见（按 team_id 动态 join team_members，不落冗余可见名单）。

### recipes 增强
```python
class Recipe(Base):
    ...既有字段...
    category_id: int | None         # 复用 categories；NULL = 未分类
```
- 迁移回填：公开菜谱按 `dish_id → dish.category_id` 回填；用户自建菜谱保持 NULL。
- `recipes.dish_id` 已存在（B 方案基础）：自建菜谱可关联菜品，"一道菜=一份做法"闭环。

### 迁移
- `d3f8a7b6c1e2` 之后新增：`xxxx_add_dish_visibility_and_recipe_category.py`
  - `dishes`: `+created_by BIGINT NULL`、`+visibility ENUM('public','team','private') NOT NULL DEFAULT 'public'`、`+team_id BIGINT NULL`（索引 `(visibility, team_id)`）
  - `recipes`: `+category_id BIGINT NULL` + 索引

---

## 3. 可见性计算（读写两侧）

### 可见规则
| visibility | 谁可见 | 表达 |
|---|---|---|
| `public` | 所有人（含游客） | 无条件（保留 is_active） |
| `team` | 记录 `team_id` 的**当前全部成员** + 创建者本人 | `Dish.team_id == X` 且 `X ∈ 当前用户加入的团队`（动态解析，不落名单） |
| `private` | 仅创建者本人 | `Dish.created_by == 当前用户` |

### 查询侧统一过滤
```python
def visible_dish_conds(db, user):
    if user is None:
        return [Dish.visibility == 'public']
    team_ids = {t.team_id for t in db.scalars(
        select(TeamMember.team_id).where(TeamMember.user_id == user.id))}
    conds = [Dish.visibility == 'public',
             Dish.visibility == 'private' & Dish.created_by == user.id]
    if team_ids:
        conds.append(Dish.visibility == 'team' & Dish.team_id.in_(team_ids))
    return [or_(*conds)]
```
- **游客（无 token）**：只见 public。现有 `/dishes`、`/categories` 已无鉴权；`GET /dishes` 改用 `get_optional_user`，游客 = public 池。
- 应用到：`GET /dishes`（列表/搜索）、`GET /dishes/{id}`（详情，不可见 404）、`/dishes/random`、`/dishes/recommend`、`fridge/suggest`、收藏列表。

### 写侧校验
- `POST /activities/{id}/items` 加菜：`_visible_dish_or_404`（同查询侧规则，不可见 40401），并保持"仅厨师/成员"等既有校验。
- `POST /dishes/{id}/favorite`：收藏先过可见性（不可见 40401）；私有菜仅本人可藏。
- `POST /plans`、`orders create`：沿用可见性过滤（加同一 conds）。
- `recipes/by-dish/{dish_id}`：关联菜品不可见时返回 null（不泄漏）。

---

## 4. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/dishes` `{category_id, name, price?, emoji?, color?, description?, ingredients?, cook_time?, difficulty?, visibility?, team_id?, recipe?}` | 新建菜品（登录）；`visibility=team` 时 `team_id` 必填；`recipe` 可选对象 → 同时创建关联公开/私有菜谱（B 方案一键闭环） |
| GET | `/dishes?category_id&keyword&page&page_size&mine=1` | 列表（可见性过滤）；`mine=1` 只看自己创建的 |
| GET | `/dishes/{id}` | 详情（不可见 404） |
| GET | `/dishes/random` `/dishes/recommend` | 从可见池抽取（复用现有逻辑，池子换可见） |
| GET | `/categories` | 不变（分类全公开） |
| GET | `/recipes?owner=public\|me&category_id&page` | 菜谱库加分类筛选；返回 `category_id/category_name` |
| PUT | `/recipes/{id}` | 支持改 `category_id`（编辑页加分类选择） |

### POST /dishes 请求示例
```json
{
  "category_id": 3, "name": "我的红烧肉", "price": 0,
  "emoji": "🍖", "color": "#FFAB91", "description": "家常改良版",
  "ingredients": ["五花肉", "冰糖"], "cook_time": 40, "difficulty": "中等",
  "visibility": "team", "team_id": 12,
  "recipe": { "name": "我的红烧肉", "steps": ["焯水", "炒糖色", "炖 40 分钟"], "is_public": false }
}
```
- 返回：`{ dish {...}, recipe_id? }`
- 权限：登录即可创建；`visibility=team` 时须为 `team_id` 团队成员。

---

## 5. 前端页面

- **菜单页 `pages/menu`**：顶部加入口「＋ 新增菜品」（悬浮/按钮），跳 `pages/dish-edit`；分类 Tab 不变；可见私有/团队菜正常展示（后端已过滤，无需前端分支）。
- **新建菜品页 `pages/dish-edit`（新）**：名称、emoji、色块、分类（单选，复用菜单分类）、价格（默认0）、食材（逗号）、耗时/难度、做法步骤（多行→数组，选填）、可见性（公开/团队公开/仅自己，团队公开时选团队）、保存 → `POST /dishes`（含 recipe）→ 跳菜品详情。
- **菜谱库 `pages/recipe-list`**：公开/我的 Tab 之上加分类横向 Tab（全部 + 各分类）；`category_id` 筛选后端。
- **菜谱编辑 `pages/recipe-edit`**：加"分类"选择（可选）；已有 `dish_id` 关联展示（若有）——"关联到菜单菜品"（选填，B 方案：可把做法的菜谱挂到某道菜，菜品详情即可见）。
- **菜品详情 `pages/dish-detail`**：私有/团队菜显示归属标签（"仅自己可见"/"我的团队可见"）；已有"查看完整做法"逻辑复用（by-dish 命中自建关联菜谱）。

---

## 6. 权限与安全

- 游客只见 public；`/dishes` 列表改 optional auth。
- private/team 菜不可见即 404（不区分 403/404，避免探测可见性）。
- 团队可见范围动态：查询时 join `team_members` 现算，不缓存冗余可见名单（数据量小，性能可接受）。
- 删除/下架：沿用 `is_active`，自建菜由创建者/组织者管理（本期不引入删除接口，下架即可隐藏）。

---

## 7. 迁移与测试

- **迁移**：`dishes` 3 列 + 回填存量（public/NULL）；`recipes.category_id` + 按 dish 回填。
- **测试** `server/tests/test_dishes_visibility.py`（新增）：
  - 游客只见 public；登录用户见 public + 自己的 private + 所在团队 team 菜
  - team 菜：成员 A/B 可见，非成员不可见；创建者离开团队后原成员不可见
  - private 菜：仅创建者可见；他人详情/收藏/加菜 404
  - POST /dishes：基本创建、team 缺 team_id 报错、非团队成员指定 team 报错、带 recipe 一键建菜谱
  - GET /recipes?category_id：分类筛选 + 回填正确
  - 随机/推荐/收藏列表只含可见菜
- 既有测试适配：`test_dishes.py` 等若断言全量列表需加可见性前提（seed 全 public，兼容）。

---

## 8. 兼容与回滚

- 存量数据零迁移成本：seed 菜 public、自建菜谱无分类（NULL 归"全部"）。
- 回滚：降级迁移即可（删列不影响 public 菜读取；前端入口隐藏）。
- 顺序：后端迁移 → 接口 → 前端（菜单入口/dish-edit → 菜谱分类 → 详情标签）→ 测试全绿 → 部署。