/**
 * 待加入饭局（pendingActivity*）存取工具——好好吃饭
 * 跨页共享"正在为某饭局加菜"状态，统一 4 个 storage key 的读写与清理，
 * 消除 menu / cart / activity-detail 各自手写 get/set/remove 的重复。
 */
import Taro from '@tarojs/taro'

const KEY_ID = 'pendingActivityId'
const KEY_TEAM_ID = 'pendingActivityTeamId'
const KEY_TYPE = 'pendingActivityType'
const KEY_NAME = 'pendingActivityName'

export interface PendingActivity {
  id: string
  teamId: string
  type: string
  name: string
}

/** 读取待加入饭局；无则返回 null */
export function getPendingActivity(): PendingActivity | null {
  try {
    const id = Taro.getStorageSync(KEY_ID) || ''
    if (!id) return null
    return {
      id: String(id),
      teamId: String(Taro.getStorageSync(KEY_TEAM_ID) || ''),
      type: String(Taro.getStorageSync(KEY_TYPE) || 'daily'),
      name: String(Taro.getStorageSync(KEY_NAME) || '')
    }
  } catch {
    return null
  }
}

export function hasPendingActivity(): boolean {
  return getPendingActivity() !== null
}

/** 仅取名称（横幅展示用） */
export function getPendingActivityName(fallback = ''): string {
  return getPendingActivity()?.name || fallback
}

export function setPendingActivity(a: { id: string | number; team_id?: string | number; type?: string; name?: string }): void {
  try {
    Taro.setStorageSync(KEY_ID, String(a.id))
    if (a.team_id != null) Taro.setStorageSync(KEY_TEAM_ID, String(a.team_id))
    if (a.type != null) Taro.setStorageSync(KEY_TYPE, String(a.type))
    if (a.name != null) Taro.setStorageSync(KEY_NAME, String(a.name))
  } catch {}
}

export function clearPendingActivity(): void {
  try {
    Taro.removeStorageSync(KEY_ID)
    Taro.removeStorageSync(KEY_TEAM_ID)
    Taro.removeStorageSync(KEY_TYPE)
    Taro.removeStorageSync(KEY_NAME)
  } catch {}
}
