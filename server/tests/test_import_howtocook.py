"""HowToCook 导入器测试：md 解析（模板字段）、图片 URL 解析、幂等导入流程。"""

from __future__ import annotations

from pathlib import Path

from seed.import_howtocook import import_howtocook, parse_dish_md, resolve_image_url

SAMPLE_MD = """# 番茄炒蛋的做法

番茄炒蛋酸甜开胃，是家喻户晓的快手菜，大约耗时 10 分钟。

预估烹饪难度：★★

预估卡路里：520 大卡

![成品](./番茄炒蛋.jpg)

## 必备原料和工具

* 番茄 2 个
* 鸡蛋 3 个
* 小葱（可选）

## 计算

按照 1 盘的份量：

* 番茄 300g
* 鸡蛋 3 个

## 操作

1. 番茄切块，鸡蛋打散
2. 热锅下油，倒入蛋液炒散
3. 下番茄翻炒出汁，加盐调味

  * 喜欢甜口可加少许白糖

## 附加内容

* 炒蛋前加油防粘

如果您遵循本指南的制作流程而发现有问题或可以改进的流程，请提出 Issue 或 Pull request 。
"""


def test_parse_dish_md_full_template():
    d = parse_dish_md(SAMPLE_MD, "番茄炒蛋")
    assert d["name"] == "番茄炒蛋"
    assert d["stars"] == 2
    assert d["difficulty"] == "简单"
    assert d["calories"] == 520
    assert d["cook_time"] == 10  # 介绍中「大约耗时 10 分钟」
    assert d["ingredients"] == ["番茄 2 个", "鸡蛋 3 个", "小葱"]  # 行尾（可选）备注被剥离，数量保留
    assert len(d["steps"]) == 3
    assert "喜欢甜口可加少许白糖" in d["steps"][-1]  # 子项并入所属步骤
    assert d["tips"] == ["炒蛋前加油防粘"]
    assert d["image_ref"] == "./番茄炒蛋.jpg"


def test_parse_dish_md_difficulty_mapping():
    """★★★★★ → 较难；无耗时信息时按星级估算。"""
    md = "# 硬菜的做法\n\n一道很复杂的菜。\n\n预估烹饪难度：★★★★★\n\n预估卡路里：800 大卡\n\n## 操作\n\n1. 步骤一\n"
    d = parse_dish_md(md, "硬菜")
    assert d["difficulty"] == "较难"
    assert d["cook_time"] == 60  # 5★ 估算 60 分钟


def test_resolve_image_url():
    base = Path("dishes")
    # 平铺：中文文件名 → URL 编码，保留 dishes/ 段
    url = resolve_image_url(Path("dishes/meat_dish/番茄炒蛋.md"), "./番茄炒蛋.jpg")
    assert url == (
        "https://gitee.com/Anduin2017/HowToCook/raw/master/"
        "dishes/meat_dish/%E7%95%AA%E8%8C%84%E7%82%92%E8%9B%8B.jpg"
    )
    # 嵌套步骤图目录：dishes/vegetable_dish/凉拌木耳/1.jpg
    url2 = resolve_image_url(Path("dishes/vegetable_dish/凉拌木耳/凉拌木耳.md"), "1.jpg")
    assert url2.endswith("/dishes/vegetable_dish/%E5%87%89%E6%8B%8C%E6%9C%A8%E8%80%B3/1.jpg")
    # 外链原样返回
    assert resolve_image_url(base, "https://example.com/a.jpg") == "https://example.com/a.jpg"
    # 越界到 dishes 之外 → None
    assert resolve_image_url(Path("dishes/aquatic/x.md"), "../../secrets.jpg") is None
    # 无图 → None
    assert resolve_image_url(base, None) is None


def _write_sample(src: Path) -> None:
    meat = src / "dishes" / "meat_dish"
    soup = src / "dishes" / "soup"
    meat.mkdir(parents=True)
    soup.mkdir(parents=True)
    (meat / "番茄炒蛋.md").write_text(SAMPLE_MD, encoding="utf-8")
    (soup / "冬瓜汤.md").write_text(
        "# 冬瓜汤的做法\n\n清爽解腻的快手汤，大约耗时 15 分钟。\n\n"
        "预估烹饪难度：★\n\n预估卡路里：120 大卡\n\n## 必备原料和工具\n\n* 冬瓜\n* 虾皮\n\n"
        "## 操作\n\n1. 冬瓜切片\n2. 加水煮开下冬瓜与虾皮\n3. 加盐调味\n",
        encoding="utf-8",
    )


def _cleanup(path: Path) -> None:
    """尽力清理临时目录（Windows 沙箱下 chmod 可能被拒，忽略清理失败）。"""
    try:
        import shutil

        shutil.rmtree(path, ignore_errors=True)
    except Exception:  # noqa: BLE001
        pass


def test_import_upsert_idempotent(db_session):
    import shutil
    import tempfile

    from sqlalchemy import select

    from app.models.dish import Category, Dish
    from app.models.recipe import Recipe

    tmp = Path(tempfile.mkdtemp(prefix="htc-test-"))
    try:
        src = tmp / "HowToCook"
        _write_sample(src)

        # 首次导入：2 道新菜 + 2 篇公开菜谱 + 2 个新分类
        st1 = import_howtocook(db_session, src)
        assert st1["dishes_new"] == 2
        assert st1["recipes_new"] == 2
        assert st1["dishes_updated"] == 0
        assert "荤菜" in {c.name for c in db_session.scalars(select(Category)).all()}

        dish = db_session.scalar(select(Dish).where(Dish.name == "番茄炒蛋"))
        assert dish is not None
        assert dish.image_url and dish.image_url.startswith("https://gitee.com/Anduin2017/HowToCook/raw/master/")
        assert dish.emoji  # 分类自动 emoji
        assert dish.price > 0  # 分类基准价
        assert dish.rating == 4.5
        recipe = db_session.scalar(
            select(Recipe).where(Recipe.dish_id == dish.id, Recipe.is_public.is_(True))
        )
        assert recipe is not None
        assert "小贴士" in recipe.description  # 附加内容并入菜谱描述

        # 二次导入：什么都不新增（幂等）
        st2 = import_howtocook(db_session, src)
        assert st2["dishes_new"] == 0 and st2["recipes_new"] == 0
    finally:
        _cleanup(tmp)


def test_import_skip_template(db_session):
    import tempfile

    from sqlalchemy import select

    from app.models.dish import Dish

    tmp = Path(tempfile.mkdtemp(prefix="htc-test-"))
    try:
        src = tmp / "HowToCook"
        tpl = src / "dishes" / "template" / "示例菜"
        tpl.mkdir(parents=True)
        (tpl / "示例菜.md").write_text("# 示例菜的做法\n\n示例内容\n", encoding="utf-8")
        (src / "dishes" / "meat_dish").mkdir(parents=True)
        st = import_howtocook(db_session, src)
        assert st["scanned"] == 0  # 未扫描到任何正式菜谱
        assert db_session.scalar(select(Dish)) is None
    finally:
        _cleanup(tmp)