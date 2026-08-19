/**
 * Mock 数据 · 菜品列表
 * 对应规划文档模块 1.1
 * 图片用占位色块 + emoji 代替，后期接后端替换真实图片
 */

window.MOCK_DATA = window.MOCK_DATA || {};

window.MOCK_DATA.dishes = [
  // ===== 荤菜 =====
  {
    id: 'dish-1',
    name: '红烧肉',
    categoryId: 'cat-1',
    price: 28.00,
    rating: 4.8,
    ratingCount: 326,
    desc: '肥而不腻，入口即化，经典家常味',
    emoji: '🥩',
    color: '#FFAB91',
    ingredients: ['五花肉', '冰糖', '生抽', '老抽', '料酒'],
    cookTime: 60,
    difficulty: '中等'
  },
  {
    id: 'dish-2',
    name: '可乐鸡翅',
    categoryId: 'cat-1',
    price: 25.00,
    rating: 4.7,
    ratingCount: 218,
    desc: '甜香入味，连骨头都嘬干净',
    emoji: '🍗',
    color: '#FFCC80',
    ingredients: ['鸡翅', '可乐', '生抽', '姜'],
    cookTime: 30,
    difficulty: '简单'
  },
  {
    id: 'dish-3',
    name: '糖醋排骨',
    categoryId: 'cat-1',
    price: 32.00,
    rating: 4.9,
    ratingCount: 412,
    desc: '酸甜适口，外酥里嫩',
    emoji: '🍖',
    color: '#EF9A9A',
    ingredients: ['排骨', '醋', '糖', '生抽'],
    cookTime: 45,
    difficulty: '中等'
  },
  {
    id: 'dish-4',
    name: '水煮鱼',
    categoryId: 'cat-1',
    price: 38.00,
    rating: 4.6,
    ratingCount: 189,
    desc: '麻辣鲜香，鱼肉嫩滑',
    emoji: '🐟',
    color: '#90CAF9',
    ingredients: ['草鱼', '豆芽', '花椒', '干辣椒'],
    cookTime: 40,
    difficulty: '较难'
  },

  // ===== 蔬菜 =====
  {
    id: 'dish-5',
    name: '蒜蓉西兰花',
    categoryId: 'cat-2',
    price: 12.00,
    rating: 4.5,
    ratingCount: 156,
    desc: '清淡爽口，营养保留好',
    emoji: '🥦',
    color: '#A5D6A7',
    ingredients: ['西兰花', '蒜', '盐'],
    cookTime: 10,
    difficulty: '简单'
  },
  {
    id: 'dish-6',
    name: '酸辣藕片',
    categoryId: 'cat-2',
    price: 14.00,
    rating: 4.6,
    ratingCount: 203,
    desc: '脆爽开胃，酸辣过瘾',
    emoji: '🥬',
    color: '#CE93D8',
    ingredients: ['莲藕', '醋', '辣椒', '蒜'],
    cookTime: 15,
    difficulty: '简单'
  },
  {
    id: 'dish-7',
    name: '红烧茄子',
    categoryId: 'cat-2',
    price: 13.00,
    rating: 4.7,
    ratingCount: 278,
    desc: '软糯入味，下饭神器',
    emoji: '🍆',
    color: '#B39DDB',
    ingredients: ['茄子', '蒜', '生抽', '糖'],
    cookTime: 20,
    difficulty: '简单'
  },
  {
    id: 'dish-8',
    name: '干煸四季豆',
    categoryId: 'cat-2',
    price: 15.00,
    rating: 4.5,
    ratingCount: 167,
    desc: '干香入味，脆嫩可口',
    emoji: '🫛',
    color: '#81C784',
    ingredients: ['四季豆', '肉末', '蒜', '干辣椒'],
    cookTime: 18,
    difficulty: '中等'
  },

  // ===== 能量补给（蛋/豆制品）=====
  {
    id: 'dish-9',
    name: '葱花火腿鸡蛋饼',
    categoryId: 'cat-3',
    price: 8.00,
    rating: 4.4,
    ratingCount: 89,
    desc: '快手早餐，营养均衡',
    emoji: '🥞',
    color: '#FFE082',
    ingredients: ['鸡蛋', '火腿', '葱花', '面粉'],
    cookTime: 15,
    difficulty: '简单'
  },
  {
    id: 'dish-10',
    name: '麻婆豆腐',
    categoryId: 'cat-3',
    price: 16.00,
    rating: 4.8,
    ratingCount: 345,
    desc: '麻、辣、烫、香、酥、嫩',
    emoji: '🧈',
    color: '#FFAB91',
    ingredients: ['豆腐', '肉末', '豆瓣酱', '花椒'],
    cookTime: 20,
    difficulty: '中等'
  },

  // ===== 汤 =====
  {
    id: 'dish-11',
    name: '番茄蛋花汤',
    categoryId: 'cat-4',
    price: 10.00,
    rating: 4.5,
    ratingCount: 234,
    desc: '酸甜开胃，汤色诱人',
    emoji: '🍅',
    color: '#EF9A9A',
    ingredients: ['番茄', '鸡蛋', '葱花'],
    cookTime: 10,
    difficulty: '简单'
  },
  {
    id: 'dish-12',
    name: '玉米排骨汤',
    categoryId: 'cat-4',
    price: 22.00,
    rating: 4.7,
    ratingCount: 198,
    desc: '清甜滋补，老少皆宜',
    emoji: '🌽',
    color: '#FFF59D',
    ingredients: ['排骨', '玉米', '胡萝卜', '姜'],
    cookTime: 90,
    difficulty: '简单'
  },

  // ===== 主食 =====
  {
    id: 'dish-13',
    name: '蛋炒饭',
    categoryId: 'cat-5',
    price: 10.00,
    rating: 4.6,
    ratingCount: 412,
    desc: '粒粒分明，金黄诱人',
    emoji: '🍚',
    color: '#FFE0B2',
    ingredients: ['米饭', '鸡蛋', '葱花', '胡萝卜'],
    cookTime: 10,
    difficulty: '简单'
  },
  {
    id: 'dish-14',
    name: '葱油拌面',
    categoryId: 'cat-5',
    price: 8.00,
    rating: 4.5,
    ratingCount: 267,
    desc: '葱香四溢，简单美味',
    emoji: '🍜',
    color: '#D7CCC8',
    ingredients: ['面条', '葱', '生抽', '老抽'],
    cookTime: 15,
    difficulty: '简单'
  },

  // ===== 凉菜 =====
  {
    id: 'dish-15',
    name: '凉拌黄瓜',
    categoryId: 'cat-6',
    price: 8.00,
    rating: 4.4,
    ratingCount: 178,
    desc: '爽脆开胃，解腻首选',
    emoji: '🥒',
    color: '#C5E1A5',
    ingredients: ['黄瓜', '蒜', '醋', '辣椒'],
    cookTime: 5,
    difficulty: '简单'
  },
  {
    id: 'dish-16',
    name: '皮蛋豆腐',
    categoryId: 'cat-6',
    price: 10.00,
    rating: 4.3,
    ratingCount: 145,
    desc: '清凉爽滑，夏日必备',
    emoji: '🥚',
    color: '#B0BEC5',
    ingredients: ['内酯豆腐', '皮蛋', '葱花', '生抽'],
    cookTime: 5,
    difficulty: '简单'
  }
];
