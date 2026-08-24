/**
 * Mock 数据 · 菜品列表
 * 对应规划文档模块 1.1；由 tools/sync_menu_mock.py 从 server/seed/seed_data.py 生成。
 * 图片用占位色块 + emoji 代替，后期接后端替换真实图片
 */

window.MOCK_DATA = window.MOCK_DATA || {};

window.MOCK_DATA.dishes = [
  {
    "id": "dish-1",
    "name": "红烧肉",
    "categoryId": "cat-1",
    "price": 28.0,
    "rating": 4.8,
    "ratingCount": 326,
    "desc": "肥而不腻，入口即化，经典家常味",
    "emoji": "🥩",
    "color": "#FFAB91",
    "ingredients": [
      "五花肉",
      "冰糖",
      "生抽",
      "老抽",
      "料酒"
    ],
    "cookTime": 60,
    "difficulty": "中等"
  },
  {
    "id": "dish-2",
    "name": "可乐鸡翅",
    "categoryId": "cat-1",
    "price": 25.0,
    "rating": 4.7,
    "ratingCount": 218,
    "desc": "甜香入味，连骨头都嘬干净",
    "emoji": "🍗",
    "color": "#FFCC80",
    "ingredients": [
      "鸡翅",
      "可乐",
      "生抽",
      "姜"
    ],
    "cookTime": 30,
    "difficulty": "简单"
  },
  {
    "id": "dish-3",
    "name": "糖醋排骨",
    "categoryId": "cat-1",
    "price": 32.0,
    "rating": 4.9,
    "ratingCount": 412,
    "desc": "酸甜适口，外酥里嫩",
    "emoji": "🍖",
    "color": "#EF9A9A",
    "ingredients": [
      "排骨",
      "醋",
      "糖",
      "生抽"
    ],
    "cookTime": 45,
    "difficulty": "中等"
  },
  {
    "id": "dish-4",
    "name": "水煮鱼",
    "categoryId": "cat-1",
    "price": 38.0,
    "rating": 4.6,
    "ratingCount": 189,
    "desc": "麻辣鲜香，鱼肉嫩滑",
    "emoji": "🐟",
    "color": "#90CAF9",
    "ingredients": [
      "草鱼",
      "豆芽",
      "花椒",
      "干辣椒"
    ],
    "cookTime": 40,
    "difficulty": "较难"
  },
  {
    "id": "dish-5",
    "name": "宫保鸡丁",
    "categoryId": "cat-1",
    "price": 22.0,
    "rating": 4.8,
    "ratingCount": 423,
    "desc": "酸甜微辣，花生香脆",
    "emoji": "🍗",
    "color": "#FF8A65",
    "ingredients": [
      "鸡腿肉",
      "花生米",
      "干辣椒",
      "葱",
      "醋"
    ],
    "cookTime": 25,
    "difficulty": "中等"
  },
  {
    "id": "dish-6",
    "name": "鱼香肉丝",
    "categoryId": "cat-1",
    "price": 20.0,
    "rating": 4.7,
    "ratingCount": 376,
    "desc": "咸甜酸辣，下饭必点",
    "emoji": "🍖",
    "color": "#FFB74D",
    "ingredients": [
      "猪里脊",
      "木耳",
      "胡萝卜",
      "泡椒",
      "醋"
    ],
    "cookTime": 25,
    "difficulty": "中等"
  },
  {
    "id": "dish-7",
    "name": "回锅肉",
    "categoryId": "cat-1",
    "price": 26.0,
    "rating": 4.8,
    "ratingCount": 512,
    "desc": "肥而不腻，蒜苗爆香",
    "emoji": "🥓",
    "color": "#EF9A9A",
    "ingredients": [
      "五花肉",
      "青蒜",
      "豆瓣酱",
      "姜"
    ],
    "cookTime": 30,
    "difficulty": "中等"
  },
  {
    "id": "dish-8",
    "name": "辣子鸡",
    "categoryId": "cat-1",
    "price": 30.0,
    "rating": 4.6,
    "ratingCount": 289,
    "desc": "麻辣酥香，越吃越上头",
    "emoji": "🌶️",
    "color": "#FF7043",
    "ingredients": [
      "鸡腿",
      "干辣椒",
      "花椒",
      "葱",
      "芝麻"
    ],
    "cookTime": 35,
    "difficulty": "较难"
  },
  {
    "id": "dish-9",
    "name": "酸菜鱼",
    "categoryId": "cat-1",
    "price": 38.0,
    "rating": 4.8,
    "ratingCount": 431,
    "desc": "酸辣开胃，鱼片滑嫩",
    "emoji": "🐟",
    "color": "#FFAB91",
    "ingredients": [
      "草鱼",
      "酸菜",
      "干辣椒",
      "花椒"
    ],
    "cookTime": 40,
    "difficulty": "较难"
  },
  {
    "id": "dish-10",
    "name": "番茄炖牛腩",
    "categoryId": "cat-1",
    "price": 42.0,
    "rating": 4.9,
    "ratingCount": 356,
    "desc": "酸甜浓郁，牛腩软烂",
    "emoji": "🍅",
    "color": "#E57373",
    "ingredients": [
      "牛腩",
      "番茄",
      "洋葱",
      "姜"
    ],
    "cookTime": 90,
    "difficulty": "中等"
  },
  {
    "id": "dish-11",
    "name": "清蒸鲈鱼",
    "categoryId": "cat-1",
    "price": 36.0,
    "rating": 4.7,
    "ratingCount": 245,
    "desc": "鲜嫩原味，清淡健康",
    "emoji": "🐟",
    "color": "#90CAF9",
    "ingredients": [
      "鲈鱼",
      "姜",
      "葱",
      "蒸鱼豉油"
    ],
    "cookTime": 20,
    "difficulty": "简单"
  },
  {
    "id": "dish-12",
    "name": "孜然牛肉",
    "categoryId": "cat-1",
    "price": 32.0,
    "rating": 4.7,
    "ratingCount": 318,
    "desc": "孜然香气，嫩滑爽口",
    "emoji": "🥩",
    "color": "#FFB74D",
    "ingredients": [
      "牛肉",
      "孜然",
      "洋葱",
      "辣椒粉"
    ],
    "cookTime": 20,
    "difficulty": "中等"
  },
  {
    "id": "dish-13",
    "name": "蒜蓉西兰花",
    "categoryId": "cat-2",
    "price": 12.0,
    "rating": 4.5,
    "ratingCount": 156,
    "desc": "清淡爽口，营养保留好",
    "emoji": "🥦",
    "color": "#A5D6A7",
    "ingredients": [
      "西兰花",
      "蒜",
      "盐"
    ],
    "cookTime": 10,
    "difficulty": "简单"
  },
  {
    "id": "dish-14",
    "name": "酸辣藕片",
    "categoryId": "cat-2",
    "price": 14.0,
    "rating": 4.6,
    "ratingCount": 203,
    "desc": "脆爽开胃，酸辣过瘾",
    "emoji": "🥬",
    "color": "#CE93D8",
    "ingredients": [
      "莲藕",
      "醋",
      "辣椒",
      "蒜"
    ],
    "cookTime": 15,
    "difficulty": "简单"
  },
  {
    "id": "dish-15",
    "name": "红烧茄子",
    "categoryId": "cat-2",
    "price": 13.0,
    "rating": 4.7,
    "ratingCount": 278,
    "desc": "软糯入味，下饭神器",
    "emoji": "🍆",
    "color": "#B39DDB",
    "ingredients": [
      "茄子",
      "蒜",
      "生抽",
      "糖"
    ],
    "cookTime": 20,
    "difficulty": "简单"
  },
  {
    "id": "dish-16",
    "name": "干煸四季豆",
    "categoryId": "cat-2",
    "price": 15.0,
    "rating": 4.5,
    "ratingCount": 167,
    "desc": "干香入味，脆嫩可口",
    "emoji": "🫛",
    "color": "#81C784",
    "ingredients": [
      "四季豆",
      "肉末",
      "蒜",
      "干辣椒"
    ],
    "cookTime": 18,
    "difficulty": "中等"
  },
  {
    "id": "dish-17",
    "name": "西红柿炒鸡蛋",
    "categoryId": "cat-2",
    "price": 12.0,
    "rating": 4.6,
    "ratingCount": 389,
    "desc": "酸甜开胃，家喻户晓",
    "emoji": "🍅",
    "color": "#FF8A65",
    "ingredients": [
      "番茄",
      "鸡蛋",
      "葱花"
    ],
    "cookTime": 10,
    "difficulty": "简单"
  },
  {
    "id": "dish-18",
    "name": "地三鲜",
    "categoryId": "cat-2",
    "price": 16.0,
    "rating": 4.6,
    "ratingCount": 276,
    "desc": "茄子土豆青椒，香糯入味",
    "emoji": "🍆",
    "color": "#A1887F",
    "ingredients": [
      "茄子",
      "土豆",
      "青椒"
    ],
    "cookTime": 25,
    "difficulty": "中等"
  },
  {
    "id": "dish-19",
    "name": "醋溜白菜",
    "categoryId": "cat-2",
    "price": 10.0,
    "rating": 4.5,
    "ratingCount": 198,
    "desc": "酸爽脆嫩，解腻下饭",
    "emoji": "🥬",
    "color": "#AED581",
    "ingredients": [
      "白菜",
      "醋",
      "干辣椒",
      "蒜"
    ],
    "cookTime": 10,
    "difficulty": "简单"
  },
  {
    "id": "dish-20",
    "name": "蒜蓉菠菜",
    "categoryId": "cat-2",
    "price": 9.0,
    "rating": 4.4,
    "ratingCount": 146,
    "desc": "蒜香清爽，补铁首选",
    "emoji": "🥬",
    "color": "#9CCC65",
    "ingredients": [
      "菠菜",
      "蒜",
      "盐"
    ],
    "cookTime": 8,
    "difficulty": "简单"
  },
  {
    "id": "dish-21",
    "name": "香菇油菜",
    "categoryId": "cat-2",
    "price": 12.0,
    "rating": 4.5,
    "ratingCount": 187,
    "desc": "菌香浓郁，清甜爽口",
    "emoji": "🍄",
    "color": "#A5D6A7",
    "ingredients": [
      "香菇",
      "油菜",
      "蚝油"
    ],
    "cookTime": 12,
    "difficulty": "简单"
  },
  {
    "id": "dish-22",
    "name": "虎皮青椒",
    "categoryId": "cat-2",
    "price": 11.0,
    "rating": 4.6,
    "ratingCount": 208,
    "desc": "外皮焦香，酸辣入味",
    "emoji": "🫑",
    "color": "#C5E1A5",
    "ingredients": [
      "青椒",
      "蒜",
      "生抽",
      "醋"
    ],
    "cookTime": 12,
    "difficulty": "简单"
  },
  {
    "id": "dish-23",
    "name": "干锅花菜",
    "categoryId": "cat-2",
    "price": 15.0,
    "rating": 4.6,
    "ratingCount": 219,
    "desc": "干香微辣，花菜脆爽",
    "emoji": "🥦",
    "color": "#A5D6A7",
    "ingredients": [
      "花菜",
      "五花肉",
      "干辣椒",
      "蒜"
    ],
    "cookTime": 18,
    "difficulty": "中等"
  },
  {
    "id": "dish-24",
    "name": "白灼芥兰",
    "categoryId": "cat-2",
    "price": 11.0,
    "rating": 4.5,
    "ratingCount": 164,
    "desc": "清甜爽脆，酱油提鲜",
    "emoji": "🥬",
    "color": "#AED581",
    "ingredients": [
      "芥兰",
      "姜",
      "蒜",
      "蒸鱼豉油"
    ],
    "cookTime": 8,
    "difficulty": "简单"
  },
  {
    "id": "dish-25",
    "name": "葱花火腿鸡蛋饼",
    "categoryId": "cat-3",
    "price": 8.0,
    "rating": 4.4,
    "ratingCount": 89,
    "desc": "快手早餐，营养均衡",
    "emoji": "🥞",
    "color": "#FFE082",
    "ingredients": [
      "鸡蛋",
      "火腿",
      "葱花",
      "面粉"
    ],
    "cookTime": 15,
    "difficulty": "简单"
  },
  {
    "id": "dish-26",
    "name": "麻婆豆腐",
    "categoryId": "cat-3",
    "price": 16.0,
    "rating": 4.8,
    "ratingCount": 345,
    "desc": "麻、辣、烫、香、酥、嫩",
    "emoji": "🧈",
    "color": "#FFAB91",
    "ingredients": [
      "豆腐",
      "肉末",
      "豆瓣酱",
      "花椒"
    ],
    "cookTime": 20,
    "difficulty": "中等"
  },
  {
    "id": "dish-27",
    "name": "韭菜炒蛋",
    "categoryId": "cat-3",
    "price": 12.0,
    "rating": 4.5,
    "ratingCount": 176,
    "desc": "韭香浓郁，鲜嫩可口",
    "emoji": "🍳",
    "color": "#FFE082",
    "ingredients": [
      "韭菜",
      "鸡蛋",
      "盐"
    ],
    "cookTime": 8,
    "difficulty": "简单"
  },
  {
    "id": "dish-28",
    "name": "青椒炒蛋",
    "categoryId": "cat-3",
    "price": 11.0,
    "rating": 4.5,
    "ratingCount": 168,
    "desc": "青椒爽脆，鸡蛋滑嫩",
    "emoji": "🍳",
    "color": "#FFE082",
    "ingredients": [
      "青椒",
      "鸡蛋",
      "盐"
    ],
    "cookTime": 8,
    "difficulty": "简单"
  },
  {
    "id": "dish-29",
    "name": "香煎豆腐",
    "categoryId": "cat-3",
    "price": 13.0,
    "rating": 4.6,
    "ratingCount": 203,
    "desc": "外焦里嫩，酱香浓郁",
    "emoji": "🧈",
    "color": "#FFCC80",
    "ingredients": [
      "老豆腐",
      "蚝油",
      "生抽",
      "葱"
    ],
    "cookTime": 15,
    "difficulty": "简单"
  },
  {
    "id": "dish-30",
    "name": "木须肉",
    "categoryId": "cat-3",
    "price": 18.0,
    "rating": 4.5,
    "ratingCount": 189,
    "desc": "鸡蛋木耳黄瓜，家常经典",
    "emoji": "🍲",
    "color": "#FFE0B2",
    "ingredients": [
      "鸡蛋",
      "木耳",
      "黄瓜",
      "猪里脊"
    ],
    "cookTime": 20,
    "difficulty": "中等"
  },
  {
    "id": "dish-31",
    "name": "番茄蛋花汤",
    "categoryId": "cat-4",
    "price": 10.0,
    "rating": 4.5,
    "ratingCount": 234,
    "desc": "酸甜开胃，汤色诱人",
    "emoji": "🍅",
    "color": "#EF9A9A",
    "ingredients": [
      "番茄",
      "鸡蛋",
      "葱花"
    ],
    "cookTime": 10,
    "difficulty": "简单"
  },
  {
    "id": "dish-32",
    "name": "玉米排骨汤",
    "categoryId": "cat-4",
    "price": 22.0,
    "rating": 4.7,
    "ratingCount": 198,
    "desc": "清甜滋补，老少皆宜",
    "emoji": "🌽",
    "color": "#FFF59D",
    "ingredients": [
      "排骨",
      "玉米",
      "胡萝卜",
      "姜"
    ],
    "cookTime": 90,
    "difficulty": "简单"
  },
  {
    "id": "dish-33",
    "name": "冬瓜排骨汤",
    "categoryId": "cat-4",
    "price": 20.0,
    "rating": 4.7,
    "ratingCount": 231,
    "desc": "清甜滋润，消暑解腻",
    "emoji": "🍲",
    "color": "#FFF59D",
    "ingredients": [
      "冬瓜",
      "排骨",
      "姜"
    ],
    "cookTime": 60,
    "difficulty": "简单"
  },
  {
    "id": "dish-34",
    "name": "紫菜蛋花汤",
    "categoryId": "cat-4",
    "price": 8.0,
    "rating": 4.5,
    "ratingCount": 214,
    "desc": "清淡鲜美，快手汤品",
    "emoji": "🍜",
    "color": "#B0BEC5",
    "ingredients": [
      "紫菜",
      "鸡蛋",
      "虾皮",
      "葱花"
    ],
    "cookTime": 8,
    "difficulty": "简单"
  },
  {
    "id": "dish-35",
    "name": "酸辣汤",
    "categoryId": "cat-4",
    "price": 15.0,
    "rating": 4.6,
    "ratingCount": 178,
    "desc": "酸辣开胃，料足味浓",
    "emoji": "🍲",
    "color": "#FFAB91",
    "ingredients": [
      "豆腐",
      "木耳",
      "鸡蛋",
      "醋",
      "白胡椒"
    ],
    "cookTime": 15,
    "difficulty": "中等"
  },
  {
    "id": "dish-36",
    "name": "菌菇鸡汤",
    "categoryId": "cat-4",
    "price": 26.0,
    "rating": 4.7,
    "ratingCount": 196,
    "desc": "菌香浓郁，滋补暖胃",
    "emoji": "🍗",
    "color": "#FFF59D",
    "ingredients": [
      "鸡",
      "菌菇",
      "姜",
      "枸杞"
    ],
    "cookTime": 70,
    "difficulty": "简单"
  },
  {
    "id": "dish-37",
    "name": "海带豆腐汤",
    "categoryId": "cat-4",
    "price": 12.0,
    "rating": 4.5,
    "ratingCount": 154,
    "desc": "清淡爽口，低脂健康",
    "emoji": "🍲",
    "color": "#B2DFDB",
    "ingredients": [
      "海带",
      "豆腐",
      "姜"
    ],
    "cookTime": 15,
    "difficulty": "简单"
  },
  {
    "id": "dish-38",
    "name": "蛋炒饭",
    "categoryId": "cat-5",
    "price": 10.0,
    "rating": 4.6,
    "ratingCount": 412,
    "desc": "粒粒分明，金黄诱人",
    "emoji": "🍚",
    "color": "#FFE0B2",
    "ingredients": [
      "米饭",
      "鸡蛋",
      "葱花",
      "胡萝卜"
    ],
    "cookTime": 10,
    "difficulty": "简单"
  },
  {
    "id": "dish-39",
    "name": "葱油拌面",
    "categoryId": "cat-5",
    "price": 8.0,
    "rating": 4.5,
    "ratingCount": 267,
    "desc": "葱香四溢，简单美味",
    "emoji": "🍜",
    "color": "#D7CCC8",
    "ingredients": [
      "面条",
      "葱",
      "生抽",
      "老抽"
    ],
    "cookTime": 15,
    "difficulty": "简单"
  },
  {
    "id": "dish-40",
    "name": "扬州炒饭",
    "categoryId": "cat-5",
    "price": 12.0,
    "rating": 4.6,
    "ratingCount": 322,
    "desc": "粒粒分明，料足鲜香",
    "emoji": "🍚",
    "color": "#FFE0B2",
    "ingredients": [
      "米饭",
      "鸡蛋",
      "虾仁",
      "火腿",
      "青豆"
    ],
    "cookTime": 15,
    "difficulty": "简单"
  },
  {
    "id": "dish-41",
    "name": "番茄鸡蛋面",
    "categoryId": "cat-5",
    "price": 10.0,
    "rating": 4.5,
    "ratingCount": 208,
    "desc": "酸甜浓郁，暖胃饱腹",
    "emoji": "🍜",
    "color": "#EF9A9A",
    "ingredients": [
      "面条",
      "番茄",
      "鸡蛋",
      "葱花"
    ],
    "cookTime": 15,
    "difficulty": "简单"
  },
  {
    "id": "dish-42",
    "name": "红烧牛肉面",
    "categoryId": "cat-5",
    "price": 20.0,
    "rating": 4.8,
    "ratingCount": 287,
    "desc": "酱香浓郁，牛肉酥烂",
    "emoji": "🍜",
    "color": "#FFAB91",
    "ingredients": [
      "面条",
      "牛腩",
      "青菜",
      "豆瓣酱"
    ],
    "cookTime": 60,
    "difficulty": "较难"
  },
  {
    "id": "dish-43",
    "name": "韭菜盒子",
    "categoryId": "cat-5",
    "price": 14.0,
    "rating": 4.4,
    "ratingCount": 176,
    "desc": "皮薄馅大，韭菜飘香",
    "emoji": "🥟",
    "color": "#FFE082",
    "ingredients": [
      "面粉",
      "韭菜",
      "鸡蛋",
      "粉丝"
    ],
    "cookTime": 30,
    "difficulty": "中等"
  },
  {
    "id": "dish-44",
    "name": "皮蛋瘦肉粥",
    "categoryId": "cat-5",
    "price": 12.0,
    "rating": 4.6,
    "ratingCount": 198,
    "desc": "绵滑咸香，暖心早餐",
    "emoji": "🥣",
    "color": "#B0BEC5",
    "ingredients": [
      "大米",
      "皮蛋",
      "猪里脊",
      "姜"
    ],
    "cookTime": 40,
    "difficulty": "简单"
  },
  {
    "id": "dish-45",
    "name": "凉拌黄瓜",
    "categoryId": "cat-6",
    "price": 8.0,
    "rating": 4.4,
    "ratingCount": 178,
    "desc": "爽脆开胃，解腻首选",
    "emoji": "🥒",
    "color": "#C5E1A5",
    "ingredients": [
      "黄瓜",
      "蒜",
      "醋",
      "辣椒"
    ],
    "cookTime": 5,
    "difficulty": "简单"
  },
  {
    "id": "dish-46",
    "name": "皮蛋豆腐",
    "categoryId": "cat-6",
    "price": 10.0,
    "rating": 4.3,
    "ratingCount": 145,
    "desc": "清凉爽滑，夏日必备",
    "emoji": "🥚",
    "color": "#B0BEC5",
    "ingredients": [
      "内酯豆腐",
      "皮蛋",
      "葱花",
      "生抽"
    ],
    "cookTime": 5,
    "difficulty": "简单"
  },
  {
    "id": "dish-47",
    "name": "口水鸡",
    "categoryId": "cat-6",
    "price": 22.0,
    "rating": 4.7,
    "ratingCount": 265,
    "desc": "麻辣鲜香，冷吃更入味",
    "emoji": "🐔",
    "color": "#FF7043",
    "ingredients": [
      "鸡腿",
      "辣椒油",
      "花生",
      "芝麻"
    ],
    "cookTime": 30,
    "difficulty": "中等"
  },
  {
    "id": "dish-48",
    "name": "凉拌木耳",
    "categoryId": "cat-6",
    "price": 10.0,
    "rating": 4.5,
    "ratingCount": 187,
    "desc": "爽脆开胃，酸辣适口",
    "emoji": "🍄",
    "color": "#A5D6A7",
    "ingredients": [
      "木耳",
      "蒜",
      "醋",
      "辣椒油"
    ],
    "cookTime": 10,
    "difficulty": "简单"
  },
  {
    "id": "dish-49",
    "name": "爽口萝卜",
    "categoryId": "cat-6",
    "price": 8.0,
    "rating": 4.4,
    "ratingCount": 156,
    "desc": "酸甜微辣，清脆爽口",
    "emoji": "🥕",
    "color": "#FFAB91",
    "ingredients": [
      "白萝卜",
      "醋",
      "糖",
      "小米辣"
    ],
    "cookTime": 15,
    "difficulty": "简单"
  },
  {
    "id": "dish-50",
    "name": "凉拌三丝",
    "categoryId": "cat-6",
    "price": 10.0,
    "rating": 4.5,
    "ratingCount": 169,
    "desc": "清爽开胃，色彩缤纷",
    "emoji": "🥗",
    "color": "#C5E1A5",
    "ingredients": [
      "胡萝卜",
      "黄瓜",
      "粉丝",
      "醋"
    ],
    "cookTime": 12,
    "difficulty": "简单"
  }
];
