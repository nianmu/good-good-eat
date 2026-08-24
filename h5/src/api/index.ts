/**
 * 后端 API 封装（跨端 H5）——好好吃饭
 * 与原生小程序共用同一套 /api/v1 REST 契约。
 * 用法：api.categories() / api.dishes() ...
 */
import { request, guestLogin, webLogin, webRegister, setToken, loadToken, logout } from './request'

export const auth = {
  guest: (nickname?: string) => guestLogin(nickname),
  me: () => request({ url: '/me' }),
  login: (username: string, password: string) => webLogin(username, password),
  register: (username: string, password: string, nickname?: string) => webRegister(username, password, nickname),
  wxLogin: (code: string) => request({ url: '/auth/wx-login', method: 'POST', data: { code }, auth: false }),
  updateProfile: (data: { nickname: string }) => request({ url: '/me', method: 'PUT', data }),
  logout,
  token: loadToken
}

export const dishes = {
  list: (params?: any) => request({ url: '/dishes', data: params }),
  detail: (id: number | string) => request({ url: `/dishes/${id}` }),
  random: (n = 3, type = 'balanced') => request({ url: `/dishes/random?n=${n}&type=${type}` }),
  recommend: (people = 3) => request({ url: `/dishes/recommend?people=${people}` }),
  recipe: (id: number | string) => request({ url: `/recipes/by-dish/${id}` })
}

export const categories = {
  list: () => request({ url: '/categories' })
}

export interface FavoriteRes { favorite: boolean }

export const favorites = {
  toggle: (dishId: number | string) =>
    request({ url: `/dishes/${dishId}/favorite`, method: 'POST' }).then(() => true),
  remove: (dishId: number | string) =>
    request({ url: `/dishes/${dishId}/favorite`, method: 'DELETE' }).then(() => false),
  list: () => request({ url: '/favorites', data: { page: 1, page_size: 100 } })
}

export const teams = {
  my: () => request({ url: '/me' }).then((r: any) => r.user?.teams || []),
  create: (name: string, description?: string) =>
    request({ url: '/teams', method: 'POST', data: { name, description } }),
  join: (inviteCode: string) => request({ url: '/teams/join', method: 'POST', data: { invite_code: inviteCode } }),
  detail: (id: number | string) => request({ url: `/teams/${id}` }),
  setChef: (id: number | string, userId: number | null) =>
    request({ url: `/teams/${id}/chef`, method: 'PUT', data: { user_id: userId } }),
  cart: (id: number | string) => request({ url: `/teams/${id}/cart` }),
  leave: (id: number | string) => request({ url: `/teams/${id}/leave`, method: 'POST' }),
  removeMember: (id: number | string, userId: number | string) =>
    request({ url: `/teams/${id}/members/${userId}`, method: 'DELETE' })
}

export const activities = {
  create: (data: { team_id: number | string; type: string; name: string; people?: number; remark?: string }) =>
    request({ url: '/activities', method: 'POST', data }),
  list: (params?: any) => request({ url: '/activities', data: params }),
  detail: (id: number | string) => request({ url: `/activities/${id}` }),
  updateStatus: (id: number | string, target: string) =>
    request({ url: `/activities/${id}/status`, method: 'POST', data: { target } }),
  addItem: (id: number | string, dish_id: number | string, quantity: number) =>
    request({ url: `/activities/${id}/items`, method: 'POST', data: { dish_id, quantity } }),
  removeItem: (id: number | string, itemId: number | string) =>
    request({ url: `/activities/${id}/items/${itemId}`, method: 'DELETE' }),
  updateChef: (id: number | string, itemId: number | string, user_id: number | string | null) =>
    request({ url: `/activities/${id}/items/${itemId}/chef`, method: 'PUT', data: { user_id } }),
  updateItemStatus: (id: number | string, itemId: number | string, target: string) =>
    request({ url: `/activities/${id}/items/${itemId}/status`, method: 'PUT', data: { target } })
}

export const orders = {
  create: (teamId: number | string, items: Array<{ dish_id: number; quantity: number }>) =>
    request({ url: '/orders', method: 'POST', data: { team_id: teamId, items } }),
  list: (params?: any) => request({ url: '/orders', data: params }),
  detail: (id: number | string) => request({ url: `/orders/${id}` }),
  accept: (id: number | string) => request({ url: `/orders/${id}/accept`, method: 'POST' }),
  claim: (id: number | string) => request({ url: `/orders/${id}/claim`, method: 'POST' }),
  status: (id: number | string, status: string) =>
    request({ url: `/orders/${id}/status`, method: 'POST', data: { status } })
}

export const chef = {
  orders: () => request({ url: '/chef/orders' }),
  aggregated: () => request({ url: '/chef/orders/aggregated' })
}

export const messages = {
  list: (page = 1, pageSize = 15) => request({ url: `/messages?page=${page}&page_size=${pageSize}` }),
  read: (id: number | string) => request({ url: `/messages/${id}/read`, method: 'POST' })
}

export const plans = {
  list: () => request({ url: '/plans' }),
  detail: (id: number | string) => request({ url: `/plans/${id}` }),
  create: (data: any) => request({ url: '/plans', method: 'POST', data }),
  remove: (id: number | string) => request({ url: `/plans/${id}`, method: 'DELETE' })
}

export const recipes = {
  list: (params?: any) => request({ url: '/recipes', data: params }),
  detail: (id: number | string) => request({ url: `/recipes/${id}` }),
  create: (data: any) => request({ url: '/recipes', method: 'POST', data }),
  update: (id: number | string, data: any) => request({ url: `/recipes/${id}`, method: 'PUT', data }),
  remove: (id: number | string) => request({ url: `/recipes/${id}`, method: 'DELETE' }),
  favorite: (id: number | string) => request({ url: `/recipes/${id}/favorite`, method: 'POST' }),
  unfavorite: (id: number | string) => request({ url: `/recipes/${id}/favorite`, method: 'DELETE' }),
  favoritesList: (params?: any) => request({ url: '/recipes/favorites', data: params })
}

export const fridge = {
  list: () => request({ url: '/fridge' }),
  add: (name: string, quantity: string) => request({ url: '/fridge', method: 'POST', data: { name, quantity } }),
  remove: (id: number | string) => request({ url: `/fridge/${id}`, method: 'DELETE' }),
  suggest: () => request({ url: '/fridge/suggest' })
}

export const basket = {
  list: () => request({ url: '/basket' }),
  add: (name: string, quantity: string) => request({ url: '/basket', method: 'POST', data: { name, quantity } }),
  toggle: (id: number | string, checked: boolean) =>
    request({ url: `/basket/${id}`, method: 'PUT', data: { checked } }),
  remove: (id: number | string) => request({ url: `/basket/${id}`, method: 'DELETE' })
}

export { request, guestLogin, setToken, loadToken }
