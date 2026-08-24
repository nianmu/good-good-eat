"""Generate the H5/prototype mock dishes.js + categories.js from server/seed/seed_data.py.

Single source of truth: server/seed/seed_data.py (CATEGORIES + DISHES).
Emits:
  prototype/scripts/data/dishes.js
  prototype/scripts/data/categories.js
Run:  python tools/sync_menu_mock.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from seed.seed_data import CATEGORIES, DISHES  # noqa: E402

PROTO = REPO / "prototype" / "scripts" / "data"

# category (by sort_order) -> stable mock id 'cat-N'
_cat_id = {c["name"]: f"cat-{i + 1}" for i, c in enumerate(CATEGORIES)}

dishes = []
for i, d in enumerate(DISHES):
    dishes.append(
        {
            "id": f"dish-{i + 1}",
            "name": d["name"],
            "categoryId": _cat_id[d["category"]],
            "price": d["price"],
            "rating": d["rating"],
            "ratingCount": d["rating_count"],
            "desc": d["desc"],
            "emoji": d["emoji"],
            "color": d["color"],
            "ingredients": d["ingredients"],
            "cookTime": d["cook_time"],
            "difficulty": d["difficulty"],
        }
    )

counts = {}
for d in DISHES:
    counts[d["category"]] = counts.get(d["category"], 0) + 1

categories = [
    {
        "id": _cat_id[c["name"]],
        "name": c["name"],
        "icon": c["icon"],
        "count": counts.get(c["name"], 0),
    }
    for c in CATEGORIES
]


dishes_js = (
    "/**\n"
    " * Mock 数据 · 菜品列表\n"
    " * 对应规划文档模块 1.1；由 tools/sync_menu_mock.py 从 server/seed/seed_data.py 生成。\n"
    " * 图片用占位色块 + emoji 代替，后期接后端替换真实图片\n"
    " */\n\n"
    "window.MOCK_DATA = window.MOCK_DATA || {};\n\n"
    "window.MOCK_DATA.dishes = " + json.dumps(dishes, ensure_ascii=False, indent=2) + ";\n"
)

categories_js = (
    "/**\n"
    " * Mock 数据 · 菜品分类\n"
    " * 对应规划文档模块 1.1；由 tools/sync_menu_mock.py 从 server/seed/seed_data.py 生成。\n"
    " */\n\n"
    "window.MOCK_DATA = window.MOCK_DATA || {};\n\n"
    "window.MOCK_DATA.categories = " + json.dumps(categories, ensure_ascii=False, indent=2) + ";\n"
)

PROTO.mkdir(parents=True, exist_ok=True)
(PROTO / "dishes.js").write_text(dishes_js, encoding="utf-8")
(PROTO / "categories.js").write_text(categories_js, encoding="utf-8")
print(f"wrote {PROTO / 'dishes.js'} ({len(dishes)} dishes)")
print(f"wrote {PROTO / 'categories.js'} ({len(categories)} categories)")
