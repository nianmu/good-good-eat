export default defineAppConfig({
  pages: [
    'pages/welcome/index',
    'pages/menu/index',
    'pages/ai-chat/index',
    'pages/activities/index',
    'pages/activity-detail/index',
    'pages/profile/index',
    'pages/cart/index',
    'pages/dish-detail/index',
    'pages/dish-edit/index',
    'pages/plans/index',
    'pages/recipe-list/index',
    'pages/recipe-edit/index',
    'pages/recipe-detail/index',
    'pages/fridge/index',
    'pages/basket/index',
    'pages/favorites/index',
    'pages/plan-edit/index',
    'pages/plan-detail/index',
    'pages/team-list/index',
    'pages/team-detail/index',
    'pages/auth/index',
    'pages/guide/index',
    'pages/theme/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#4CAF50',
    navigationBarTitleText: '好好吃饭',
    navigationBarTextStyle: 'white'
  },
  tabBar: {
    color: '#666666',
    selectedColor: '#4CAF50',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/menu/index',
        text: '菜谱',
        iconPath: 'assets/tabbar/menu.png',
        selectedIconPath: 'assets/tabbar/menu-active.png'
      },
      {
        pagePath: 'pages/activities/index',
        text: '饭局',
        iconPath: 'assets/tabbar/orders.png',
        selectedIconPath: 'assets/tabbar/orders-active.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '我的',
        iconPath: 'assets/tabbar/profile.png',
        selectedIconPath: 'assets/tabbar/profile-active.png'
      }
    ]
  }
})