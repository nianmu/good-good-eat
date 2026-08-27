# 好好吃饭 · 后端服务

电子菜单小程序/H5 的 FastAPI 后端：团队饭局、菜品可见性、协作购物车（WebSocket）、菜谱、厨房管理、饮食计划。

## 技术栈

- Python 3.13 + FastAPI + Uvicorn
- SQLAlchemy 2.x（同步，pymysql）+ MySQL 8（utf8mb4）
- JWT（PyJWT, HS256）认证；PBKDF2 密码哈希
- Alembic 迁移；pytest 测试；httpx（微信登录 & 媒体代理）

## 快速开始

```bash
cd server
uv sync                      # 安装依赖（含 dev 组）
cp .env.example .env         # 配置环境变量（生产必须改 JWT_SECRET）
uv run alembic upgrade head  # 建表/迁移
uv run python -m seed.seed_data          # 种子数据（6 分类 + 50 菜 + 公开菜谱）
uv run uvicorn app.main:app --reload --port 8000
```

## 环境变量（.env）

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `DEBUG` | 调试模式；**false 时强制校验强 JWT_SECRET** | `false` |
| `DATABASE_URL` | 业务库连接串 | 本机 3307 |
| `TEST_DATABASE_URL` | 测试库连接串 | 本机 3307/good_good_eat_test |
| `JWT_SECRET` | ≥32 位随机密钥（`python -c "import secrets;print(secrets.token_hex(32))"`） | 开发默认值 |
| `JWT_EXPIRE_DAYS` | token 有效期（天） | 30 |
| `WX_APPID` / `WX_SECRET` | 微信小程序凭据，任一为空时 wx-login 返回 40001 | 空 |
| `CORS_ORIGINS` | 逗号分隔白名单或 `*` | `*` |

## 目录结构

```
app/
├── api/v1/      # REST 路由（auth/teams/dishes/activities/recipes/fridge/basket/plans/favorites/media）
├── core/        # 配置/DB/JWT/异常/统一响应信封
├── models/      # SQLAlchemy ORM 模型
├── schemas/     # Pydantic 入参与序列化
├── services/    # 认证等领域服务
└── ws/          # 团队房间 WebSocket（连接管理 + 协作购物车）
alembic/         # 迁移（head: a7c3d9e2f1b8 basket 唯一约束）
seed/            # 种子数据与 HowToCook 导入
tests/           # pytest（88 例，需测试库可连）
```

## WebSocket 团队房间

`GET /ws/team/{team_id}`，鉴权两种方式：

1. **推荐**：子协议携带 token —— 客户端 `protocols: ["ggc-token", <jwt>]`（token 不进 URL）
2. 兼容旧客户端：查询参数 `?token=<jwt>`（将逐步废弃）

事件协议见 `app/ws/handlers.py` 模块注释。注意：购物车为单进程内存态，多 worker 部署时快照不共享。

## 常用命令

```bash
uv run pytest                 # 全量测试
uv run alembic upgrade head   # 迁移到最新
uv run python -m seed.import_howtocook --help   # HowToCook 菜谱导入
```

## 部署

参考 `deploy/deploy-server.sh`（阿里云一键脚本 + systemd + nginx）。生产检查清单：

- [ ] `DEBUG=false` 且已配置强随机 `JWT_SECRET`
- [ ] `CORS_ORIGINS` 改为具体域名白名单（勿用 `*`）
- [ ] nginx 为 `/ws/` 开启 Upgrade 头（WS 反代）
- [ ] 单 worker 运行（购物车内存储），或后续引入 Redis pub/sub
