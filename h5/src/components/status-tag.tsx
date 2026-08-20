/**
 * 订单状态徽章（跨端 H5）——好好吃饭
 * 对齐原生小程序 components/status-chip：颜色按 state map。
 */
import { Tag } from '@nutui/nutui-react-taro'
import { statusChip } from '../utils/format'

export default function StatusTag({ status }: { status: string }) {
  const m = statusChip(status)
  return (
    <Tag
      plain
      background={m.bg}
      color={m.color}
      style={{ display: 'inline-flex', alignItems: 'center', padding: '0 6px', borderRadius: '4px', fontSize: '12px', lineHeight: '18px' }}
    >
      {m.label}
    </Tag>
  )
}
