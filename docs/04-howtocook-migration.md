# HowToCook 菜谱迁移方案（M 系列 · 文档）

> 将开源项目 [HowToCook（程序员做饭指南）](https://gitee.com/Anduin2017/HowToCook)
> 的 367 道菜谱结构化导入「好好吃饭」，并支持定期增量同步上游变化。

## 1. 来源与合规

| 项 | 说明 |
| --- | --- |
| 上游仓库 | `HowToCook/`（项目根目录，用户手动克隆，完整历史非 shallow） |
| 上游链接 | <https://gitee.com/Anduin2017/HowToCook> |
| 许可证 | **Unlicense（公有领域）**：可自由复制、修改、商用，无版权障碍 |
| 数据规模 | 369 篇 md（367 道正式菜 + template 示例跳过），11 个分类目录 |
| 图片 | 上游仓库内 ~355 张 jpg/png；约 48% 的菜有图（179/367） |

## 2. 迁移方式：解析 + 幂等 upsert 脚本

**核心脚本：`server/seed/import_howtocook.py`**

流程：扫描 `HowToCook/dishes/<分类>/**/*.md` → 按统一模板解析 → 映射本项目字段 →
按菜名幂等 upsert（Dish + 官方公开 Recipe）。

### 2.1 上游 md 模板 → 本项目字段映射

| 上游模板节 | 本项目字段 | 说明 |
| --- | --- | --- |
| `# 菜名 的做法` | `Dish.name` | 与文件名对齐 |
| 介绍段落 | `Dish.description`（截断 100 字）+ `Recipe.description`（全文 + 小贴士） | |
| `预估烹饪难度：★~★★★★★` | `difficulty` | 1-2★ 简单 / 3★ 中等 / 4-5★ 较难 |
| `预估卡路里` | （不落库，随介绍内容保留） | |
| 介绍中「X 分钟/X 小时」 | `cook_time` | 无则按星级估算 |
| `## 必备原料和工具` | `ingredients`（JSON 数组） | 行尾（推荐/可选）备注剥离，数量保留 |
| `## 操作` 编号行 | `Recipe.steps`（JSON 数组） | 子项/续行并入所属步骤 |
| `## 附加内容` | 并入 `Recipe.description` 小贴士段 | |
| 图片引用（md 内第一张） | `Dish.image_url` / `Recipe.image_url` | 见 §3 |

### 2.2 分类映射（全部按 HowToCook 上游分类）

| 上游目录 | 本项目分类 | 营养角色 | 基准价 |
| --- | --- | --- | --- |
| meat_dish | 荤菜（复用现有） | meat | 25 |
| vegetable_dish | 蔬菜也要吃呀（复用现有） | veg | 12 |
| aquatic | 水产（新增） | meat | 30 |
| staple | 主食（复用现有） | staple | 10 |
| soup | 饭后最后一口汤（复用现有） | soup | 15 |
| breakfast | 早餐（新增） | energy | 8 |
| dessert | 甜品（新增） | energy | 12 |
| drink | 饮品（新增） | other | 8 |
| semi-finished | 半成品（新增） | other | 15 |
| condiment | 调料（新增） | other | 3 |
| template | 跳过（示例模板） | — | — |

- 与现有 6 类同名的（荤菜/蔬菜也要吃呀/汤/主食）**复用现有分类**，其余 6 个新分类追加；
- 营养角色已同步进 `server/app/api/v1/dishes.py` 的 `_CATEGORY_ROLE`
  （新增：水产→meat、早餐→energy、甜品→energy、饮品/半成品/调料→other），
  随机点菜/营养推荐算法无需改动即兼容。

### 2.3 缺失字段默认值

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| price | 按分类基准价（上表） | 同名菜保留原运营价 |
| rating / rating_count | 4.5 / 100 | 导入后可人工调整 |
| emoji / color | 按分类自动生成 | 前端「有图用图、无图回落 emoji 色块」 |
| visibility | public（平台菜） | created_by=NULL，同现有种子 |

## 3. 图片复用：Gitee raw 在线链接

上游图片是**仓库内本地文件**（不是外链），可直接用 Gitee raw 地址：

```
https://gitee.com/Anduin2017/HowToCook/raw/master/dishes/<分类>/<菜名>/封面图.jpg
```

- 脚本自动把 md 内图片相对路径（支持嵌套子目录、`./`、`../`）换算成 raw URL，并做 URL 编码；
- 已存在的 2 个外链原样保留；
- **零拷贝、零静态挂载**，git pull 后新图自动可用；
- 前端：`server` 已贯通 `image_url`（模型→序列化→API）；H5 菜单卡片/推荐弹层/菜品详情
  已实现「有图显示图片，无图回落 emoji 色块」。

### 3.1 防盗链与后端代理（重要）

**现象**：`gitee.com/.../raw/master/...` 链接浏览器地址栏可直接打开（无 Referer），
但网站内 `<img>` 会携带本站 Referer，被 Gitee 防盗链拒绝（302 → `assets.gitee.com/favicon.ico`
→ 403），页面图片全部显示不出来。

**方案：后端代理**（`server/app/api/v1/media.py`）：

| 项 | 说明 |
| --- | --- |
| 接口 | `GET /api/v1/media/htc/dishes/...`（挂在 `/api/v1` 下，nginx 无需改动） |
| 回源 | 服务端请求 gitee raw（无 Referer → 正常 200），跟随重定向后返回图片流 |
| 缓存 | 响应带 `Cache-Control: public, max-age=604800`（浏览器缓存 7 天，同一张图只回源一次） |
| 安全 | 仅放行 `dishes/` 内相对路径（拒 `..` 穿越、非 dishes 前缀），防 SSRF/任意回源 |
| 前端 | `h5/src/api/config.ts` 的 `mediaUrl()` 自动把 gitee 直链换成代理相对路径（菜单卡/菜品详情已接入，外链原样保留） |
| 验证 | 线上代理接口返回 200 / image/jpeg；页面实测图片 `naturalWidth > 0` 全部可加载 |
| 代价 | 355 张图首次经服务器回源一次（合计约 100MB，一次性摊薄），之后浏览器本地缓存 |

**备选方案**（若线上服务器访问 gitee 网络不佳时考虑）：把图片下载到本地静态目录托管
（`curl` 无 Referer 可正常下载 200），nginx 已对 `/static/` 配置 1 年长缓存，前端直引用本地路径。

**诊断方法**（如何确认是防盗链，而不是链路/404）：

```bash
# 无 Referer（= 浏览器地址栏直开）→ 应 200
curl -s -o /dev/null -w '%{http_code}\n' -L \
  'https://gitee.com/Anduin2017/HowToCook/raw/master/dishes/vegetable_dish/凉拌木耳/1.jpg'
# 带网站 Referer（= 网页内 <img> 行为）→ 防盗链时被 302 到 favicon 后 403
curl -s -o /dev/null -w '%{http_code}\n' -L -H 'Referer: http://<你的站点>/' \
  'https://gitee.com/Anduin2017/HowToCook/raw/master/dishes/vegetable_dish/凉拌木耳/1.jpg'
```

**注意事项**
- 同步 SQL 只落 `image_url` 字符串，图片内容始终回源 gitee；若 gitee 仓库改名/路径变更，
  需同步更新 `media.py` 的 `RAW_BASE`；
- 代理接口有 7 天浏览器缓存，改图后同一 URL 内容不变（新图走新 URL），无脏缓存问题；
- 本地开发（API base 为 `http://127.0.0.1:8000`）同样走代理，联调不受防盗链影响。

## 4. 定期拉取最新变化（新流程：本地生成 SQL → 线上执行）

**工作流（不再往线上传 md / 写脚本）：**

```
本地：git pull HowToCook → import_howtocook.py（更新本地库供核对）
     → export_howtocook_sql.py（生成同步 SQL，server/seed/output/howtocook_sync_<ts>.sql）
线上：mysql -u<user> -p good_good_eat < howtocook_sync_<ts>.sql
```

一键脚本：**`tools/sync_howtocook.ps1`**（git pull + 本地导入 + 生成 SQL，最后提示上传执行）。

**同步 SQL（`server/seed/export_howtocook_sql.py`）幂等语义：**
- 分类/官方菜谱账号/菜品/公开菜谱：全部按「UPDATE 既有 + INSERT ... WHERE NOT EXISTS」生成；
- 同名菜（线上存量）只刷新内容字段（描述/食材/耗时/难度/emoji/色块/图片/分类），
  **不动 price/rating/rating_count 运营字段**；
- 不删除任何线上数据（上游删除的菜，SQL 只是不再更新它）；
- 可重复执行（幂等），无副作用。

## 5. 用法速查

```bash
# 开发库导入（默认 src=项目根/HowToCook）
cd server
python seed/import_howtocook.py

# 只解析统计不写库
python seed/import_howtocook.py --dry-run

# 生成线上同步 SQL（幂等，输出 server/seed/output/howtocook_sync_<ts>.sql）
python seed/export_howtocook_sql.py

# 调试：只处理前 N 篇
python seed/import_howtocook.py --limit 10
python seed/export_howtocook_sql.py --limit 10
```

## 6. 注意事项

1. **自行核对价格**：导入菜价格为分类基准价，非真实定价，建议运营按需调整；
2. **同名覆盖策略**：与现有种子同名的菜（如可乐鸡翅），导入会**更新**其描述/步骤/图片，
   保留原 price/rating；若不想覆盖，用 `--no-update`；
3. **原料含数量**：`ingredients` 保留「番茄 2 个」这类带数量写法（对冰箱联动更有用）；
4. 步骤中个别含 `### 小标题`（如「方法二」）会并入所属步骤，信息不丢失；
5. 测试：`pytest tests/test_import_howtocook.py`（解析/URL/幂等导入/跳过模板）；
6. **部署编码坑**：HowToCook 的 md/目录名含中文，**Windows 端不要用 zip 打包**（bsdtar/右击压缩
   会用本地代码页编码文件名，服务器 unzip 解码成 `?` 导致解析崩）；请用
   `tar -czf htc-md.tar.gz HowToCook/dishes` 打包、服务器 `tar -xzf` 解压（UTF-8 无歧义）。
   线上部署：`deploy_remote.sh`（上传后 `bash deploy_remote.sh`，含前端/后端/HowToCook 三包部署+重启+导入）。
7. 若部署环境无法访问 gitee（图片 404），可改为本地静态挂载
   （`app.mount("/static/htc", StaticFiles(directory=HowToCook/dishes))` + 相对路径存 image_url）。