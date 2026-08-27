/**
 * Markdown 渲染器（H5）——好好吃饭
 * 用成熟库 `marked`（GFM 表格支持）把 AI 返回的 Markdown 转 HTML，
 * 再由 `dangerouslySetInnerHTML` 渲染，样式走全局 CSS `.md-body`（见 app.scss）。
 *
 * - H5（TARO_ENV !== 'weapp'）：dangerouslySetInnerHTML + .md-body 样式
 * - weapp：降级为纯文本（微信端无 raw HTML 渲染能力，且当前主目标是 H5）
 * - 安全：marked 不转义源 HTML，输出前做轻量清洗（去 script/style/事件属性/javascript: 链接）
 * - 流式：source 逐 delta 全量重解析（内容不大，性能无感），支持打字机光标
 */
import { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import { Marked } from 'marked'

const md = new Marked({
  gfm: true,
  breaks: true,
})

/** 轻量 HTML 清洗：去 script/style、事件属性、javascript: 链接（AI 输出不可信） */
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\shref\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, '')
}

export interface MdRendererProps {
  source: string
  /** 流式光标（打字机） */
  cursor?: boolean
}

export default function MdRenderer({ source, cursor }: MdRendererProps) {
  const html = useMemo(
    () => sanitize(md.parse(source || '', { async: false }) as string),
    [source]
  )
  const isH5 = process.env.TARO_ENV !== 'weapp'

  return (
    <View>
      {isH5 ? (
        <View>
          <View className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
          {cursor ? <Text style={{ color: '#999' }}>▌</Text> : null}
        </View>
      ) : (
        // weapp 降级：纯文本（无 raw HTML 渲染能力）
        <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {source}
          {cursor ? '▌' : ''}
        </Text>
      )}
    </View>
  )
}