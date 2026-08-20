/**
 * 通用格式化工具（跨端 H5）——好好吃饭
 * 与原生小程序 miniprogram/utils/util.js 契约一致。
 */
function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

/** 金额：保留两位小数，输出如 28.00 */
export function formatPrice(n: any): string {
  const num = Number(n)
  if (Number.isNaN(num)) return '0.00'
  return num.toFixed(2)
}

/** 任意输入 → Date（兼容 iOS 无 - 的日期字符串解析） */
function toDate(input: any): Date | null {
  if (!input) return null
  if (input instanceof Date) return input
  if (typeof input === 'number') return new Date(input)
  if (typeof input === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(input)) {
      const d = new Date(input.replace(/-/g, '/'))
      return Number.isNaN(d.getTime()) ? null : d
    }
    const t = Date.parse(input)
    return t ? new Date(t) : null
  }
  return null
}

/** 时间格式化：YYYY-MM-DD HH:mm */
export function formatTime(input: any): string {
  const d = toDate(input)
  if (!d) return input ? String(input) : ''
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  )
}

/** 订单状态 → 徽章样式（与原生 status-chip 对齐） */
export const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待接单', color: '#FF9800', bg: '#FFF3E0' },
  accepted: { label: '已接单', color: '#2196F3', bg: '#E3F2FD' },
  cooking: { label: '制作中', color: '#FF9800', bg: '#FFF3E0' },
  ready: { label: '待取餐', color: '#4CAF50', bg: '#E8F5E9' },
  completed: { label: '已完成', color: '#666666', bg: '#F5F5F5' }
}

export function statusChip(status: string) {
  return STATUS_MAP[status] || { label: status || '未知', color: '#666666', bg: '#F5F5F5' }
}

/** 菜品摘要：前两项菜名，超过则 "等 N 种"（与原生 normalize 一致） */
export function dishSummary(items: any[]): string {
  const arr = items || []
  const names = arr.slice(0, 2).map((i: any) => i.name).filter(Boolean)
  let summary = names.join('、')
  if (arr.length > 2) summary += ' 等' + arr.length + '种'
  return summary
}
