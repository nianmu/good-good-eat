"""好大一颗菜 · 种子数据（M2.3）：6 分类 + 16 道菜。

数据源：prototype/scripts/data/categories.js 与 dishes.js（字段一一对应）。

用法：
  1. 独立运行（默认开发库 good_good_eat）：
       uv run python seed/seed_data.py
  2. 复用（传入任意 Session，便于测试/其他库）：
       from seed.seed_data import seed_all
       seed_all(db)

幂等：按 name 存在即跳过，可重复执行。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# 独立运行时将 server/ 加入 sys.path（import 复用时已存在则跳过）
SERVER_DIR = Path(__file__).resolve().parent.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.dish import Category, Dish

CATEGORIES: list[dict] = [
    {"name": "荤菜", "icon": "🥩", "sort_order": 1},
    {"name": "蔬菜也要吃呀", "icon": "🥬", "sort_order": 2},
    {"name": "美味能量补给", "icon": "🍳", "sort_order": 3},
    {"name": "饭后最后一口汤", "icon": "🍲", "sort_order": 4},
    {"name": "主食", "icon": "🍚", "sort_order": 5},
    {"name": "凉菜", "icon": "🥒", "sort_order": 6},
]

DISHES: list[dict] = [
    # ===== 荤菜 =====
    {"category": "荤菜", "name": "红烧肉", "price": 28.00, "rating": 4.8, "rating_count": 326,
     "desc": "肥而不腻，入口即化，经典家常味", "emoji": "🥩", "color": "#FFAB91",
     "ingredients": ["五花肉", "冰糖", "生抽", "老抽", "料酒"], "cook_time": 60, "difficulty": "中等"},
    {"category": "荤菜", "name": "可乐鸡翅", "price": 25.00, "rating": 4.7, "rating_count": 218,
     "desc": "甜香入味，连骨头都嘬干净", "emoji": "🍗", "color": "#FFCC80",
     "ingredients": ["鸡翅", "可乐", "生抽", "姜"], "cook_time": 30, "difficulty": "简单"},
    {"category": "荤菜", "name": "糖醋排骨", "price": 32.00, "rating": 4.9, "rating_count": 412,
     "desc": "酸甜适口，外酥里嫩", "emoji": "🍖", "color": "#EF9A9A",
     "ingredients": ["排骨", "醋", "糖", "生抽"], "cook_time": 45, "difficulty": "中等"},
    {"category": "荤菜", "name": "水煮鱼", "price": 38.00, "rating": 4.6, "rating_count": 189,
     "desc": "麻辣鲜香，鱼肉嫩滑", "emoji": "🐟", "color": "#90CAF9",
     "ingredients": ["草鱼", "豆芽", "花椒", "干辣椒"], "cook_time": 40, "difficulty": "较难"},
    # ===== 蔬菜 =====
    {"category": "蔬菜也要吃呀", "name": "蒜蓉西兰花", "price": 12.00, "rating": 4.5, "rating_count": 156,
     "desc": "清淡爽口，营养保留好", "emoji": "🥦", "color": "#A5D6A7",
     "ingredients": ["西兰花", "蒜", "盐"], "cook_time": 10, "difficulty": "简单"},
    {"category": "蔬菜也要吃呀", "name": "酸辣藕片", "price": 14.00, "rating": 4.6, "rating_count": 203,
     "desc": "脆爽开胃，酸辣过瘾", "emoji": "🥬", "color": "#CE93D8",
     "ingredients": ["莲藕", "醋", "辣椒", "蒜"], "cook_time": 15, "difficulty": "简单"},
    {"category": "蔬菜也要吃呀", "name": "红烧茄子", "price": 13.00, "rating": 4.7, "rating_count": 278,
     "desc": "软糯入味，下饭神器", "emoji": "🍆", "color": "#B39DDB",
     "ingredients": ["茄子", "蒜", "生抽", "糖"], "cook_time": 20, "difficulty": "简单"},
    {"category": "蔬菜也要吃呀", "name": "干煸四季豆", "price": 15.00, "rating": 4.5, "rating_count": 167,
     "desc": "干香入味，脆嫩可口", "emoji": "🫛", "color": "#81C784",
     "ingredients": ["四季豆", "肉末", "蒜", "干辣椒"], "cook_time": 18, "difficulty": "中等"},
    # ===== 能量补给 =====
    {"category": "美味能量补给", "name": "葱花火腿鸡蛋饼", "price": 8.00, "rating": 4.4, "rating_count": 89,
     "desc": "快手早餐，营养均衡", "emoji": "🥞", "color": "#FFE082",
     "ingredients": ["鸡蛋", "火腿", "葱花", "面粉"], "cook_time": 15, "difficulty": "简单"},
    {"category": "美味能量补给", "name": "麻婆豆腐", "price": 16.00, "rating": 4.8, "rating_count": 345,
     "desc": "麻、辣、烫、香、酥、嫩", "emoji": "🧈", "color": "#FFAB91",
     "ingredients": ["豆腐", "肉末", "豆瓣酱", "花椒"], "cook_time": 20, "difficulty": "中等"},
    # ===== 汤 =====
    {"category": "饭后最后一口汤", "name": "番茄蛋花汤", "price": 10.00, "rating": 4.5, "rating_count": 234,
     "desc": "酸甜开胃，汤色诱人", "emoji": "🍅", "color": "#EF9A9A",
     "ingredients": ["番茄", "鸡蛋", "葱花"], "cook_time": 10, "difficulty": "简单"},
    {"category": "饭后最后一口汤", "name": "玉米排骨汤", "price": 22.00, "rating": 4.7, "rating_count": 198,
     "desc": "清甜滋补，老少皆宜", "emoji": "🌽", "color": "#FFF59D",
     "ingredients": ["排骨", "玉米", "胡萝卜", "姜"], "cook_time": 90, "difficulty": "简单"},
    # ===== 主食 =====
    {"category": "主食", "name": "蛋炒饭", "price": 10.00, "rating": 4.6, "rating_count": 412,
     "desc": "粒粒分明，金黄诱人", "emoji": "🍚", "color": "#FFE0B2",
     "ingredients": ["米饭", "鸡蛋", "葱花", "胡萝卜"], "cook_time": 10, "difficulty": "简单"},
    {"category": "主食", "name": "葱油拌面", "price": 8.00, "rating": 4.5, "rating_count": 267,
     "desc": "葱香四溢，简单美味", "emoji": "🍜", "color": "#D7CCC8",
     "ingredients": ["面条", "葱", "生抽", "老抽"], "cook_time": 15, "difficulty": "简单"},
    # ===== 凉菜 =====
    {"category": "凉菜", "name": "凉拌黄瓜", "price": 8.00, "rating": 4.4, "rating_count": 178,
     "desc": "爽脆开胃，解腻首选", "emoji": "🥒", "color": "#C5E1A5",
     "ingredients": ["黄瓜", "蒜", "醋", "辣椒"], "cook_time": 5, "difficulty": "简单"},
    {"category": "凉菜", "name": "皮蛋豆腐", "price": 10.00, "rating": 4.3, "rating_count": 145,
     "desc": "清凉爽滑，夏日必备", "emoji": "🥚", "color": "#B0BEC5",
     "ingredients": ["内酯豆腐", "皮蛋", "葱花", "生抽"], "cook_time": 5, "difficulty": "简单"},
]


def seed_all(db: Session) -> dict:
    """幂等写入分类与菜品：按 name 存在即跳过。返回新增数量。"""
    added_categories = 0
    added_dishes = 0

    for cat in CATEGORIES:
        exists = db.scalar(select(Category).where(Category.name == cat["name"]).limit(1))
        if exists is None:
            db.add(Category(**cat))
            added_categories += 1
    db.flush()

    cat_map = {c.name: c for c in db.scalars(select(Category)).all()}
    for d in DISHES:
        exists = db.scalar(select(Dish).where(Dish.name == d["name"]).limit(1))
        if exists is not None:
            continue
        db.add(
            Dish(
                category_id=cat_map[d["category"]].id,
                name=d["name"],
                price=d["price"],
                rating=d["rating"],
                rating_count=d["rating_count"],
                description=d["desc"],
                emoji=d["emoji"],
                color=d["color"],
                ingredients=json.dumps(d["ingredients"], ensure_ascii=False),
                cook_time=d["cook_time"],
                difficulty=d["difficulty"],
                is_active=True,
            )
        )
        added_dishes += 1

    db.commit()
    return {"categories": added_categories, "dishes": added_dishes}


def main() -> None:
    """独立运行入口：默认作用于开发库 good_good_eat。"""
    # Windows GBK 管道/重定向下 emoji 无法编码会导致日志输出崩溃；改为容错编码
    import sys

    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(errors="backslashreplace")

    db = SessionLocal()
    try:
        result = seed_all(db)
        print(f"[seed] 完成：新增分类 {result['categories']} 个，新增菜品 {result['dishes']} 道（已存在则跳过）")
    finally:
        db.close()


if __name__ == "__main__":
    main()