"""HowToCook 同步 SQL 生成器测试：语句结构 + 测试库执行（全新/幂等）。"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from sqlalchemy import select, text

from seed.export_howtocook_sql import HTC_ORDER, generate_sync_sql
from seed.import_howtocook import import_howtocook  # noqa: F401 保留导入路径约束

SAMPLE = """# 番茄炒蛋的做法

番茄炒蛋酸甜开胃，大约耗时 10 分钟。

预估烹饪难度：★★

预估卡路里：520 大卡

![成品](./番茄炒蛋.jpg)

## 必备原料和工具

* 番茄
* 鸡蛋

## 操作

1. 番茄切块，鸡蛋打散
2. 热锅下油，倒入蛋液炒散
3. 加盐调味

## 附加内容

* 炒蛋前加油防粘
"""


def _make_src() -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="htc-sql-"))
    src = tmp / "HowToCook"
    meat = src / "dishes" / "meat_dish"
    soup = src / "dishes" / "soup"
    meat.mkdir(parents=True)
    soup.mkdir(parents=True)
    (meat / "番茄炒蛋.md").write_text(SAMPLE, encoding="utf-8")
    (soup / "冬瓜汤.md").write_text(
        "# 冬瓜汤的做法\n\n清爽快手汤，约 15 分钟。\n\n预估烹饪难度：★\n\n预估卡路里：120 大卡\n\n"
        "## 必备原料和工具\n\n* 冬瓜\n* 虾皮\n\n## 操作\n\n1. 冬瓜切片\n2. 加水煮开\n",
        encoding="utf-8",
    )
    return src


def _cleanup(path: Path) -> None:
    try:
        shutil.rmtree(path, ignore_errors=True)
    except Exception:  # noqa: BLE001
        pass


def test_generate_sql_structure():
    src = _make_src()
    try:
        stmts, stats = generate_sync_sql(src)
        assert stats["parsed"] == 2
        assert stats["dishes_update"] == 2 and stats["dishes_insert"] == 2
        assert stats["recipes_update"] == 2 and stats["recipes_insert"] == 2
        assert any(s.startswith("UPDATE dishes") for s in stmts)
        assert any(s.startswith("INSERT INTO dishes") and "WHERE NOT EXISTS" in s for s in stmts)
        assert any("user_code = 'OFFICIAL'" in s for s in stmts)
        assert any("SET NAMES utf8mb4" in s for s in stmts)
        # 菜名/内容正确转义进语句
        assert any("番茄炒蛋" in s for s in stmts)
        # 生成的每一条语句结尾是分号（去掉末行注释后）
        for s in stmts:
            assert s.rstrip().endswith(";"), f"语句未以分号结尾: {s[:60]}..."
    finally:
        _cleanup(src)


def test_sql_executes_clean_and_idempotent(db_session):
    from app.models.dish import Category, Dish
    from app.models.recipe import Recipe

    src = _make_src()
    try:
        stmts, stats = generate_sync_sql(src)
        # 空库执行
        for s in stmts:
            db_session.execute(text(s))
        db_session.commit()
        assert len(db_session.scalars(select(Dish)).all()) == 2
        # SQL 确保全部 10 个 HowToCook 分类存在（幂等），即使样例只涉及 2 个分类
        assert len(db_session.scalars(select(Category)).all()) == len(HTC_ORDER) == 10
        assert len(db_session.scalars(select(Recipe)).all()) == 2
        # 幂等：再执行一遍数量不变
        for s in stmts:
            db_session.execute(text(s))
        db_session.commit()
        assert len(db_session.scalars(select(Dish)).all()) == 2
        assert len(db_session.scalars(select(Recipe)).all()) == 2
    finally:
        _cleanup(src)


def test_sql_escapes_quotes(db_session):
    """含引号/反斜杠的菜名与步骤：SQL 转义正确且可在库上执行。"""
    from app.models.dish import Category, Dish

    src = _make_src()
    try:
        meat = src / "dishes" / "meat_dish"
        (meat / "O'Brien 牛排.md").write_text(
            "# O'Brien 牛排的做法\n\n外焦里嫩，约 20 分钟。\n\n预估烹饪难度：★★★\n\n预估卡路里：400 大卡\n\n"
            "## 必备原料和工具\n\n* 牛排\\切片\n\n## 操作\n\n1. 加热平底锅 200°C（'7' 档）\n2. 下牛排两面各煎 2 分钟\n",
            encoding="utf-8",
        )
        stmts, stats = generate_sync_sql(src)
        assert stats["parsed"] == 3
        assert any("O''Brien" in s for s in stmts)  # 单引号已翻倍转义
        for s in stmts:  # 转义正确则全部可执行
            db_session.execute(text(s))
        db_session.commit()
        assert len(db_session.scalars(select(Dish)).all()) == 3
        assert len(db_session.scalars(select(Category)).all()) == len(HTC_ORDER)
    finally:
        _cleanup(src)