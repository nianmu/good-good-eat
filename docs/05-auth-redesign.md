# 统一用户体系重构（解耦账号与身份）

> 状态：已实施（2026-08）｜上游：[01-功能规划.md](../01-功能规划.md) · [02-开发规划.md](../02-开发规划.md)
> 触发背景：不止小程序，H5/未来各端都要登录。旧设计把「微信 openid」直接放在 `users` 表上，
> 账号与渠道身份强耦合，无法支撑多端/多渠道绑定、游客数据延续。

---

## 1. 设计目标

| # | 目标 | 价值 |
|---|------|------|
| 1 | users 成为 **跨端统一账号** | H5/小程序/未来渠道都指向同一账号 |
| 2 | 引入 **user_identities 身份绑定表** | 一个账号可绑微信 / 用户名密码 / 游客 ... |
| 3 | **登录即自动注册并绑定** | 用户任意渠道进来，无需手动手动绑定 |
| 4 | **游客静默升级** | 游客账号绑定任一正式渠道即自动升级，订单/团队/收藏不丢 |
| 5 | H5 **用户名+密码**独立账号 | 不再依赖微信 openid |

---

## 2. 数据模型

```
users（统一账号）
 ├─ id / nickname / avatar / user_code（8位唯一标识）
 ├─ is_guest           0=正式账号，1=纯游客
 ├─ created_at / updated_at

user_identities（渠道身份绑定，可多对一）
 ├─ id
 ├─ user_id        FK → users.id
 ├─ provider       'password' | 'wechat' | 'guest' | (未来可扩)
 ├─ provider_uid   渠道内唯一标识（openid / 用户名 / 游客昵称）
 ├─ credential      加密凭据（password 存 PBKDF2 哈希；oauth 可存 refresh token）
 ├─ extra_json      渠道额外信息（unionid / 渠道昵称头像）
 └─ UNIQUE(provider, provider_uid)
```

> **迁移**（`alembic c2f3a8b94d1e`）：新建 user_identities，回填原 `users.openid` → (wechat) 身份，
> 随后移除 `users.openid` 列。

---

## 3. 登录流程（核心算法）

```
POST /auth/guest/nick → 同名游客复用，否则新建游客
POST /auth/register{username,password}（H5）→ 未登录注册新账号 / 已登录绑定并升级
POST /auth/login{username,password}（H5）→ 校验密码哈希
POST /auth/wx-login{code}（小程序）→ code2session → 微信绑定

游客静默升级：
  游客（携带 Authorization）调 register / wx-login
  → 该渠道身份绑到当前游客账号，is_guest=0，保留所有原有数据（订单/团队）

身份占用保护：
  若渠道身份已被其他账号绑定 → 40006「该身份已绑定其他账号」，不做静默合并
```

错误码新增：`40020` 用户名已被注册 / `40021` 用户名或密码错误 / `40006` 身份已绑定其他账号。

---

## 4. 密码哈希

- 采用 stdlib **PBKDF2-HMAC-SHA256**（每次随机 16 字节 salt，迭代 20 万次，无额外依赖）。
- 存储格式 `pbkdf2_sha256$<salt_hex>$<digest_hex>`；`verify_password` 恒时比较。
- 登录失败（账号不存在 / 密码错误）统一报 `40021`，避免用户名枚举。

---

## 5. 兼容与改动用清单

| 项 | 变化 |
|----|------|
| API 形状 | `/auth/guest`、`/auth/wx-login`、`/me` 契约不变；前端 mock 零改动 |
| JWT | 仍以 `user.id` 签发，"登录仅换 token，业务逻辑不动" |
| 新增端点 | `/auth/register`、`/auth/login`（H5 用户名密码） |
| 模型 | `users` 去掉 `openid` 列；新增 `user_identities` |
| 测试 | 新增 4 项认证用例；此后全量测试持续增长（当前 78 项通过） |

---

## 6. 后续（未做）

- ~~H5 前端接入 `/auth/register`+`/auth/login`~~ —— **已完成**（`h5/src/api/request.ts` + `pages/auth`）。
- 微信 unionid 关联同一账号（多 AppID / 小程序去重）。
- 微信 unionid 关联同一账号（多 AppID / 小程序去重）。
- 手机号 / 邮箱 / OTP 第二渠道。
- 账号状态（禁用/注销）与绑定管理 UI。