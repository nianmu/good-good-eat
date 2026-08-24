"""好好吃饭 · 种子数据（M2.3 + 最终版）：6 分类 + 50 道菜 + 50 篇公开菜谱。

数据源：prototype/scripts/data/categories.js 与 dishes.js（字段一一对应）。
菜品取材自主流中文食谱数据（下厨房等公开菜谱集），经人工整理为家常/饭店常见菜，
保证 name/ingredients/cook_time/difficulty 真实可用。
公开菜谱：为每道在售菜品配一篇含做法步骤（RECIPE_STEPS）的公开菜谱，归属官方账号。

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
from app.models.recipe import Recipe
from app.models.user import User

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
    {"category": "荤菜", "name": "宫保鸡丁", "price": 22.00, "rating": 4.8, "rating_count": 423,
     "desc": "酸甜微辣，花生香脆", "emoji": "🍗", "color": "#FF8A65",
     "ingredients": ["鸡腿肉", "花生米", "干辣椒", "葱", "醋"], "cook_time": 25, "difficulty": "中等"},
    {"category": "荤菜", "name": "鱼香肉丝", "price": 20.00, "rating": 4.7, "rating_count": 376,
     "desc": "咸甜酸辣，下饭必点", "emoji": "🍖", "color": "#FFB74D",
     "ingredients": ["猪里脊", "木耳", "胡萝卜", "泡椒", "醋"], "cook_time": 25, "difficulty": "中等"},
    {"category": "荤菜", "name": "回锅肉", "price": 26.00, "rating": 4.8, "rating_count": 512,
     "desc": "肥而不腻，蒜苗爆香", "emoji": "🥓", "color": "#EF9A9A",
     "ingredients": ["五花肉", "青蒜", "豆瓣酱", "姜"], "cook_time": 30, "difficulty": "中等"},
    {"category": "荤菜", "name": "辣子鸡", "price": 30.00, "rating": 4.6, "rating_count": 289,
     "desc": "麻辣酥香，越吃越上头", "emoji": "🌶️", "color": "#FF7043",
     "ingredients": ["鸡腿", "干辣椒", "花椒", "葱", "芝麻"], "cook_time": 35, "difficulty": "较难"},
    {"category": "荤菜", "name": "酸菜鱼", "price": 38.00, "rating": 4.8, "rating_count": 431,
     "desc": "酸辣开胃，鱼片滑嫩", "emoji": "🐟", "color": "#FFAB91",
     "ingredients": ["草鱼", "酸菜", "干辣椒", "花椒"], "cook_time": 40, "difficulty": "较难"},
    {"category": "荤菜", "name": "番茄炖牛腩", "price": 42.00, "rating": 4.9, "rating_count": 356,
     "desc": "酸甜浓郁，牛腩软烂", "emoji": "🍅", "color": "#E57373",
     "ingredients": ["牛腩", "番茄", "洋葱", "姜"], "cook_time": 90, "difficulty": "中等"},
    {"category": "荤菜", "name": "清蒸鲈鱼", "price": 36.00, "rating": 4.7, "rating_count": 245,
     "desc": "鲜嫩原味，清淡健康", "emoji": "🐟", "color": "#90CAF9",
     "ingredients": ["鲈鱼", "姜", "葱", "蒸鱼豉油"], "cook_time": 20, "difficulty": "简单"},
    {"category": "荤菜", "name": "孜然牛肉", "price": 32.00, "rating": 4.7, "rating_count": 318,
     "desc": "孜然香气，嫩滑爽口", "emoji": "🥩", "color": "#FFB74D",
     "ingredients": ["牛肉", "孜然", "洋葱", "辣椒粉"], "cook_time": 20, "difficulty": "中等"},
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
    {"category": "蔬菜也要吃呀", "name": "西红柿炒鸡蛋", "price": 12.00, "rating": 4.6, "rating_count": 389,
     "desc": "酸甜开胃，家喻户晓", "emoji": "🍅", "color": "#FF8A65",
     "ingredients": ["番茄", "鸡蛋", "葱花"], "cook_time": 10, "difficulty": "简单"},
    {"category": "蔬菜也要吃呀", "name": "地三鲜", "price": 16.00, "rating": 4.6, "rating_count": 276,
     "desc": "茄子土豆青椒，香糯入味", "emoji": "🍆", "color": "#A1887F",
     "ingredients": ["茄子", "土豆", "青椒"], "cook_time": 25, "difficulty": "中等"},
    {"category": "蔬菜也要吃呀", "name": "醋溜白菜", "price": 10.00, "rating": 4.5, "rating_count": 198,
     "desc": "酸爽脆嫩，解腻下饭", "emoji": "🥬", "color": "#AED581",
     "ingredients": ["白菜", "醋", "干辣椒", "蒜"], "cook_time": 10, "difficulty": "简单"},
    {"category": "蔬菜也要吃呀", "name": "蒜蓉菠菜", "price": 9.00, "rating": 4.4, "rating_count": 146,
     "desc": "蒜香清爽，补铁首选", "emoji": "🥬", "color": "#9CCC65",
     "ingredients": ["菠菜", "蒜", "盐"], "cook_time": 8, "difficulty": "简单"},
    {"category": "蔬菜也要吃呀", "name": "香菇油菜", "price": 12.00, "rating": 4.5, "rating_count": 187,
     "desc": "菌香浓郁，清甜爽口", "emoji": "🍄", "color": "#A5D6A7",
     "ingredients": ["香菇", "油菜", "蚝油"], "cook_time": 12, "difficulty": "简单"},
    {"category": "蔬菜也要吃呀", "name": "虎皮青椒", "price": 11.00, "rating": 4.6, "rating_count": 208,
     "desc": "外皮焦香，酸辣入味", "emoji": "🫑", "color": "#C5E1A5",
     "ingredients": ["青椒", "蒜", "生抽", "醋"], "cook_time": 12, "difficulty": "简单"},
    {"category": "蔬菜也要吃呀", "name": "干锅花菜", "price": 15.00, "rating": 4.6, "rating_count": 219,
     "desc": "干香微辣，花菜脆爽", "emoji": "🥦", "color": "#A5D6A7",
     "ingredients": ["花菜", "五花肉", "干辣椒", "蒜"], "cook_time": 18, "difficulty": "中等"},
    {"category": "蔬菜也要吃呀", "name": "白灼芥兰", "price": 11.00, "rating": 4.5, "rating_count": 164,
     "desc": "清甜爽脆，酱油提鲜", "emoji": "🥬", "color": "#AED581",
     "ingredients": ["芥兰", "姜", "蒜", "蒸鱼豉油"], "cook_time": 8, "difficulty": "简单"},
    # ===== 能量补给（蛋/豆制品）=====
    {"category": "美味能量补给", "name": "葱花火腿鸡蛋饼", "price": 8.00, "rating": 4.4, "rating_count": 89,
     "desc": "快手早餐，营养均衡", "emoji": "🥞", "color": "#FFE082",
     "ingredients": ["鸡蛋", "火腿", "葱花", "面粉"], "cook_time": 15, "difficulty": "简单"},
    {"category": "美味能量补给", "name": "麻婆豆腐", "price": 16.00, "rating": 4.8, "rating_count": 345,
     "desc": "麻、辣、烫、香、酥、嫩", "emoji": "🧈", "color": "#FFAB91",
     "ingredients": ["豆腐", "肉末", "豆瓣酱", "花椒"], "cook_time": 20, "difficulty": "中等"},
    {"category": "美味能量补给", "name": "韭菜炒蛋", "price": 12.00, "rating": 4.5, "rating_count": 176,
     "desc": "韭香浓郁，鲜嫩可口", "emoji": "🍳", "color": "#FFE082",
     "ingredients": ["韭菜", "鸡蛋", "盐"], "cook_time": 8, "difficulty": "简单"},
    {"category": "美味能量补给", "name": "青椒炒蛋", "price": 11.00, "rating": 4.5, "rating_count": 168,
     "desc": "青椒爽脆，鸡蛋滑嫩", "emoji": "🍳", "color": "#FFE082",
     "ingredients": ["青椒", "鸡蛋", "盐"], "cook_time": 8, "difficulty": "简单"},
    {"category": "美味能量补给", "name": "香煎豆腐", "price": 13.00, "rating": 4.6, "rating_count": 203,
     "desc": "外焦里嫩，酱香浓郁", "emoji": "🧈", "color": "#FFCC80",
     "ingredients": ["老豆腐", "蚝油", "生抽", "葱"], "cook_time": 15, "difficulty": "简单"},
    {"category": "美味能量补给", "name": "木须肉", "price": 18.00, "rating": 4.5, "rating_count": 189,
     "desc": "鸡蛋木耳黄瓜，家常经典", "emoji": "🍲", "color": "#FFE0B2",
     "ingredients": ["鸡蛋", "木耳", "黄瓜", "猪里脊"], "cook_time": 20, "difficulty": "中等"},
    # ===== 汤 =====
    {"category": "饭后最后一口汤", "name": "番茄蛋花汤", "price": 10.00, "rating": 4.5, "rating_count": 234,
     "desc": "酸甜开胃，汤色诱人", "emoji": "🍅", "color": "#EF9A9A",
     "ingredients": ["番茄", "鸡蛋", "葱花"], "cook_time": 10, "difficulty": "简单"},
    {"category": "饭后最后一口汤", "name": "玉米排骨汤", "price": 22.00, "rating": 4.7, "rating_count": 198,
     "desc": "清甜滋补，老少皆宜", "emoji": "🌽", "color": "#FFF59D",
     "ingredients": ["排骨", "玉米", "胡萝卜", "姜"], "cook_time": 90, "difficulty": "简单"},
    {"category": "饭后最后一口汤", "name": "冬瓜排骨汤", "price": 20.00, "rating": 4.7, "rating_count": 231,
     "desc": "清甜滋润，消暑解腻", "emoji": "🍲", "color": "#FFF59D",
     "ingredients": ["冬瓜", "排骨", "姜"], "cook_time": 60, "difficulty": "简单"},
    {"category": "饭后最后一口汤", "name": "紫菜蛋花汤", "price": 8.00, "rating": 4.5, "rating_count": 214,
     "desc": "清淡鲜美，快手汤品", "emoji": "🍜", "color": "#B0BEC5",
     "ingredients": ["紫菜", "鸡蛋", "虾皮", "葱花"], "cook_time": 8, "difficulty": "简单"},
    {"category": "饭后最后一口汤", "name": "酸辣汤", "price": 15.00, "rating": 4.6, "rating_count": 178,
     "desc": "酸辣开胃，料足味浓", "emoji": "🍲", "color": "#FFAB91",
     "ingredients": ["豆腐", "木耳", "鸡蛋", "醋", "白胡椒"], "cook_time": 15, "difficulty": "中等"},
    {"category": "饭后最后一口汤", "name": "菌菇鸡汤", "price": 26.00, "rating": 4.7, "rating_count": 196,
     "desc": "菌香浓郁，滋补暖胃", "emoji": "🍗", "color": "#FFF59D",
     "ingredients": ["鸡", "菌菇", "姜", "枸杞"], "cook_time": 70, "difficulty": "简单"},
    {"category": "饭后最后一口汤", "name": "海带豆腐汤", "price": 12.00, "rating": 4.5, "rating_count": 154,
     "desc": "清淡爽口，低脂健康", "emoji": "🍲", "color": "#B2DFDB",
     "ingredients": ["海带", "豆腐", "姜"], "cook_time": 15, "difficulty": "简单"},
    # ===== 主食 =====
    {"category": "主食", "name": "蛋炒饭", "price": 10.00, "rating": 4.6, "rating_count": 412,
     "desc": "粒粒分明，金黄诱人", "emoji": "🍚", "color": "#FFE0B2",
     "ingredients": ["米饭", "鸡蛋", "葱花", "胡萝卜"], "cook_time": 10, "difficulty": "简单"},
    {"category": "主食", "name": "葱油拌面", "price": 8.00, "rating": 4.5, "rating_count": 267,
     "desc": "葱香四溢，简单美味", "emoji": "🍜", "color": "#D7CCC8",
     "ingredients": ["面条", "葱", "生抽", "老抽"], "cook_time": 15, "difficulty": "简单"},
    {"category": "主食", "name": "扬州炒饭", "price": 12.00, "rating": 4.6, "rating_count": 322,
     "desc": "粒粒分明，料足鲜香", "emoji": "🍚", "color": "#FFE0B2",
     "ingredients": ["米饭", "鸡蛋", "虾仁", "火腿", "青豆"], "cook_time": 15, "difficulty": "简单"},
    {"category": "主食", "name": "番茄鸡蛋面", "price": 10.00, "rating": 4.5, "rating_count": 208,
     "desc": "酸甜浓郁，暖胃饱腹", "emoji": "🍜", "color": "#EF9A9A",
     "ingredients": ["面条", "番茄", "鸡蛋", "葱花"], "cook_time": 15, "difficulty": "简单"},
    {"category": "主食", "name": "红烧牛肉面", "price": 20.00, "rating": 4.8, "rating_count": 287,
     "desc": "酱香浓郁，牛肉酥烂", "emoji": "🍜", "color": "#FFAB91",
     "ingredients": ["面条", "牛腩", "青菜", "豆瓣酱"], "cook_time": 60, "difficulty": "较难"},
    {"category": "主食", "name": "韭菜盒子", "price": 14.00, "rating": 4.4, "rating_count": 176,
     "desc": "皮薄馅大，韭菜飘香", "emoji": "🥟", "color": "#FFE082",
     "ingredients": ["面粉", "韭菜", "鸡蛋", "粉丝"], "cook_time": 30, "difficulty": "中等"},
    {"category": "主食", "name": "皮蛋瘦肉粥", "price": 12.00, "rating": 4.6, "rating_count": 198,
     "desc": "绵滑咸香，暖心早餐", "emoji": "🥣", "color": "#B0BEC5",
     "ingredients": ["大米", "皮蛋", "猪里脊", "姜"], "cook_time": 40, "difficulty": "简单"},
    # ===== 凉菜 =====
    {"category": "凉菜", "name": "凉拌黄瓜", "price": 8.00, "rating": 4.4, "rating_count": 178,
     "desc": "爽脆开胃，解腻首选", "emoji": "🥒", "color": "#C5E1A5",
     "ingredients": ["黄瓜", "蒜", "醋", "辣椒"], "cook_time": 5, "difficulty": "简单"},
    {"category": "凉菜", "name": "皮蛋豆腐", "price": 10.00, "rating": 4.3, "rating_count": 145,
     "desc": "清凉爽滑，夏日必备", "emoji": "🥚", "color": "#B0BEC5",
     "ingredients": ["内酯豆腐", "皮蛋", "葱花", "生抽"], "cook_time": 5, "difficulty": "简单"},
    {"category": "凉菜", "name": "口水鸡", "price": 22.00, "rating": 4.7, "rating_count": 265,
     "desc": "麻辣鲜香，冷吃更入味", "emoji": "🐔", "color": "#FF7043",
     "ingredients": ["鸡腿", "辣椒油", "花生", "芝麻"], "cook_time": 30, "difficulty": "中等"},
    {"category": "凉菜", "name": "凉拌木耳", "price": 10.00, "rating": 4.5, "rating_count": 187,
     "desc": "爽脆开胃，酸辣适口", "emoji": "🍄", "color": "#A5D6A7",
     "ingredients": ["木耳", "蒜", "醋", "辣椒油"], "cook_time": 10, "difficulty": "简单"},
    {"category": "凉菜", "name": "爽口萝卜", "price": 8.00, "rating": 4.4, "rating_count": 156,
     "desc": "酸甜微辣，清脆爽口", "emoji": "🥕", "color": "#FFAB91",
     "ingredients": ["白萝卜", "醋", "糖", "小米辣"], "cook_time": 15, "difficulty": "简单"},
    {"category": "凉菜", "name": "凉拌三丝", "price": 10.00, "rating": 4.5, "rating_count": 169,
     "desc": "清爽开胃，色彩缤纷", "emoji": "🥗", "color": "#C5E1A5",
     "ingredients": ["胡萝卜", "黄瓜", "粉丝", "醋"], "cook_time": 12, "difficulty": "简单"},
]


# ===== 平台公开菜谱（最终版）：为每道菜配一篇含做法步骤的公开菜谱 =====
# name -> 做法步骤（JSON 数组字符串）
RECIPE_STEPS: dict[str, list[str]] = {
    "红烧肉": ["五花肉切大块，冷水下锅焯水去浮沫。", "锅中少油放冰糖，小火炒出糖色。", "下五花肉翻炒上色，加生抽、老抽、料酒。", "加开水没过肉，小火炖40分钟。", "大火收汁至浓稠即可。"],
    "可乐鸡翅": ["鸡翅两面划刀，冷水焯水。", "少油煎至两面金黄。", "倒入可乐没过鸡翅，加生抽、姜。", "大火烧开转中小火焖15分钟。", "大火收汁至浓稠。"],
    "糖醋排骨": ["排骨焯水沥干，用料酒、生抽腌10分钟。", "排骨下油锅炸至微黄（或煎）。", "调糖醋汁：醋、糖、生抽、水。", "倒入炒匀，大火收汁裹匀。"],
    "水煮鱼": ["草鱼片成薄片，用盐、蛋清、淀粉腌。", "豆芽炒断生垫碗底。", "锅中炒香豆瓣酱、干辣椒、花椒，加水煮开。", "下鱼片煮至变色，连汤倒入碗中。", "撒花椒、干辣椒，淋热油。"],
    "宫保鸡丁": ["鸡腿肉切丁，用料酒、生抽、淀粉腌。", "调宫保汁：醋、糖、生抽、淀粉、水。", "爆香干辣椒、花椒，下鸡丁炒熟。", "加葱段、花生米，倒汁翻炒收浓。"],
    "鱼香肉丝": ["里脊切丝，用料酒、淀粉腌。", "调鱼香汁：醋、糖、生抽、泡椒、水、淀粉。", "炒香泡椒、姜蒜，下肉丝滑炒。", "加木耳丝、胡萝卜丝，倒汁收浓。"],
    "回锅肉": ["五花肉整块下锅，加姜煮至八成熟，切薄片。", "锅中少油下肉片煸至卷曲出油。", "下豆瓣酱炒出红油，加青蒜。", "加生抽、糖调味，翻炒断生。"],
    "辣子鸡": ["鸡腿切小块，用料酒、盐、淀粉腌。", "炸至金黄酥脆，捞出。", "爆香大量干辣椒、花椒，下鸡块。", "加葱、芝麻，翻炒均匀。"],
    "酸菜鱼": ["草鱼片片，用盐、蛋清、淀粉腌。", "炒香酸菜，加水煮出酸味。", "下鱼片煮至变色。", "撒花椒、干辣椒，淋热油。"],
    "番茄炖牛腩": ["牛腩切块焯水。", "炒香洋葱、番茄块，下牛腩翻炒。", "加开水、姜，小火炖1.5小时。", "加盐调味，大火收汁。"],
    "清蒸鲈鱼": ["鲈鱼洗净打花刀，铺姜片、葱段。", "水开后上锅蒸8分钟，倒掉蒸出的水。", "铺葱丝，淋蒸鱼豉油。", "浇上热油激香。"],
    "孜然牛肉": ["牛肉切片，用料酒、淀粉腌。", "炒香洋葱，下牛肉大火快炒。", "加孜然、辣椒粉、盐。", "翻炒均匀，出锅前撒葱花。"],
    "蒜蓉西兰花": ["西兰花掰小朵，盐水焯烫30秒。", "蒜末爆香。", "下西兰花大火快炒。", "加盐调味即可。"],
    "酸辣藕片": ["莲藕去皮切片泡水。", "爆香蒜末、干辣椒。", "下藕片翻炒，加醋、生抽。", "大火快炒，加盐、糖调味。"],
    "红烧茄子": ["茄子切滚刀块，盐腌出水。", "煎至软身盛出。", "爆香蒜末，下茄子。", "加生抽、糖、少许水烧入味。"],
    "干煸四季豆": ["四季豆沥干，煸至表皮起皱。", "下肉末、蒜末、干辣椒。", "加生抽、糖、盐。", "翻炒入味即可。"],
    "西红柿炒鸡蛋": ["鸡蛋打散，炒熟盛出。", "下番茄块炒出汁水。", "倒回鸡蛋，加盐、糖。", "翻匀撒葱花。"],
    "地三鲜": ["茄子、土豆切块，土豆炸熟、茄子煎软。", "爆香蒜末，下青椒。", "加生抽、糖、蚝油调汁，倒入翻炒。"],
    "醋溜白菜": ["白菜帮斜刀切片，白菜叶分开。", "爆香干辣椒、蒜末。", "先下菜帮炒，再下菜叶。", "沿锅边淋醋，加盐、糖，翻匀。"],
    "蒜蓉菠菜": ["菠菜洗净焯水。", "蒜末爆香。", "下菠菜大火快炒。", "加盐调味出锅。"],
    "香菇油菜": ["油菜焯烫摆盘。", "香菇切片炒软。", "加蚝油、生抽、少许水煮开。", "淋在油菜上。"],
    "虎皮青椒": ["青椒拍扁，干锅煎至表皮起皱。", "下蒜末。", "加生抽、醋、糖调汁。", "翻动收汁入味。"],
    "干锅花菜": ["花菜掰小朵焯水。", "五花肉煸出油，下干辣椒、蒜。", "下花菜翻炒。", "加生抽、盐，炒至干香。"],
    "白灼芥兰": ["芥兰洗净，焯至断生摆盘。", "姜丝、蒜末煸香，加蒸鱼豉油调成料汁。", "浇在芥兰上，淋热油激香。"],
    "葱花火腿鸡蛋饼": ["面粉加水调成糊，磕入鸡蛋。", "加葱花、火腿丁、盐搅匀。", "平底锅刷油，倒入面糊摊平。", "两面煎至金黄。"],
    "麻婆豆腐": ["豆腐切块焯水。", "炒香肉末、豆瓣酱、花椒。", "加水烧开，下豆腐煮3分钟。", "水淀粉勾芡，撒花椒粉。"],
    "韭菜炒蛋": ["鸡蛋打散炒熟盛出。", "下韭菜段大火快炒。", "倒回鸡蛋，加盐。", "翻匀立即出锅。"],
    "青椒炒蛋": ["鸡蛋炒熟盛出。", "下青椒丝炒至断生。", "倒回鸡蛋，加盐调味。", "翻匀出锅。"],
    "香煎豆腐": ["豆腐切厚片，煎至两面金黄。", "加生抽、蚝油、糖、少许水。", "小火焖入味，收汁。", "撒葱花。"],
    "木须肉": ["鸡蛋炒熟，木耳泡发撕小朵。", "肉片滑炒至变色。", "下木耳、黄瓜片、鸡蛋。", "加盐、生抽调味。"],
    "番茄蛋花汤": ["水烧开，下番茄块煮出味。", "淋入蛋液成蛋花。", "加盐、葱花，点几滴香油。"],
    "玉米排骨汤": ["排骨焯水。", "加玉米段、胡萝卜块、姜。", "加水炖1小时。", "加盐调味。"],
    "冬瓜排骨汤": ["排骨焯水。", "加冬瓜块、姜，加水。", "炖40分钟至冬瓜透明。", "加盐调味。"],
    "紫菜蛋花汤": ["锅中烧水，放虾皮。", "放紫菜，淋蛋液成蛋花。", "加盐、葱花，点香油。"],
    "酸辣汤": ["锅中烧水，下豆腐丝、木耳丝。", "加醋、白胡椒、生抽。", "淋蛋液，水淀粉勾芡。", "撒葱花、香菜。"],
    "菌菇鸡汤": ["鸡剁块焯水。", "加水、姜、菌菇炖40分钟。", "加枸杞再炖10分钟。", "加盐调味。"],
    "海带豆腐汤": ["海带泡发切块，豆腐切块。", "加水、姜，煮开。", "下豆腐、海带煮10分钟。", "加盐、葱花。"],
    "蛋炒饭": ["米饭打散，鸡蛋炒散。", "下米饭炒匀。", "加胡萝卜丁、葱花。", "加盐、生抽，炒至粒粒分明。"],
    "葱油拌面": ["面条煮熟过凉。", "葱段炸至焦黄成葱油。", "加生抽、老抽、糖调汁。", "拌入面条。"],
    "扬州炒饭": ["米饭打散，虾仁焯熟，鸡蛋炒散。", "下米饭、火腿丁、青豆。", "加盐、生抽炒匀。", "加葱花、虾仁翻炒。"],
    "番茄鸡蛋面": ["炒香番茄块，加水煮开做汤底。", "下面条煮熟。", "淋入蛋液，加盐。", "撒葱花。"],
    "红烧牛肉面": ["牛腩焯水，炒香豆瓣酱、姜蒜。", "下牛腩，加生抽、老抽、糖。", "加水炖1小时成汤头。", "面煮好浇上牛肉汤，放青菜。"],
    "韭菜盒子": ["温水烫面和成面团醒发。", "馅：韭菜、鸡蛋、粉丝拌匀。", "擀皮包馅，捏出花边。", "平底锅烙至两面金黄。"],
    "皮蛋瘦肉粥": ["大米加水熬成粥底。", "下皮蛋丁、瘦肉丝、姜丝。", "再煮10分钟。", "加盐、葱花。"],
    "口水鸡": ["鸡腿煮熟，冰水浸凉切块。", "调红油料汁：辣椒油、生抽、醋、糖、蒜。", "淋在鸡块上。", "撒花生碎、芝麻、葱花。"],
    "凉拌黄瓜": ["黄瓜拍裂切段。", "加蒜末、醋、生抽、糖。", "加辣椒油拌匀。", "冷藏更爽口。"],
    "皮蛋豆腐": ["内酯豆腐切块摆盘。", "皮蛋切瓣。", "淋生抽、醋、香油调汁，撒葱花。"],
    "凉拌木耳": ["木耳泡发焯熟，过凉。", "加蒜末、醋、生抽、辣椒油。", "拌匀即可。"],
    "爽口萝卜": ["白萝卜切片，盐腌去水。", "加醋、糖、小米辣，拌匀。", "冷藏1小时口感更佳。"],
    "凉拌三丝": ["胡萝卜丝、黄瓜丝、粉丝焯熟。", "加醋、生抽、香油、辣椒油。", "拌匀装盘。"],
}

# 平台官方菜谱账号（公开菜谱的归属者）
OFFICIAL_USER = {
    "nickname": "好好吃饭·官方菜谱",
    "avatar": "🍽",
    "user_code": "OFFICIAL",
    "is_guest": False,
}


def seed_public_recipes(db: Session) -> int:
    """幂等写入平台公开菜谱：为每道在售菜品配一篇公开菜谱（复用菜品的食材/耗时/难度 + 做法步骤）。

    归属 OFFICIAL_USER（找不到则创建）；按 dish_id 存在即跳过。
    返回新增菜谱数量。
    """
    # 找到/创建官方账号
    official = db.scalar(select(User).where(User.user_code == OFFICIAL_USER["user_code"]).limit(1))
    if official is None:
        official = User(**OFFICIAL_USER)
        db.add(official)
        db.flush()

    dish_map = {d.name: d for d in db.scalars(select(Dish)).all()}
    added = 0
    for dish in dish_map.values():
        exists = db.scalar(
            select(Recipe).where(Recipe.dish_id == dish.id, Recipe.is_public.is_(True)).limit(1)
        )
        if exists is not None:
            continue
        steps = RECIPE_STEPS.get(dish.name, ["准备好所有食材。", "按口味调味后烹饪至熟。", "出锅装盘即可。"])
        db.add(
            Recipe(
                user_id=official.id,
                dish_id=dish.id,
                name=dish.name,
                emoji=dish.emoji or "🍽",
                color=dish.color or "#4CAF50",
                description=dish.description or "",
                ingredients=dish.ingredients or "[]",
                steps=json.dumps(steps, ensure_ascii=False),
                cook_time=dish.cook_time,
                difficulty=dish.difficulty,
                is_public=True,
            )
        )
        added += 1
    db.flush()
    return added


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

    added_recipes = seed_public_recipes(db)

    db.commit()
    return {"categories": added_categories, "dishes": added_dishes, "recipes": added_recipes}


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
        print(
            f"[seed] 完成：新增分类 {result['categories']} 个，新增菜品 {result['dishes']} 道，"
            f"新增公开菜谱 {result['recipes']} 篇（已存在则跳过）"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
