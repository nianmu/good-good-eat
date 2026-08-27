/**
 * 轻量 Markdown 渲染器（跨端 Taro 组件实现）——好好吃饭
 * 用于 AI 对话气泡：把大模型返回的 Markdown 渲染成富文本。
 *
 * 解析（纯函数，见 utils/markdown-parse.ts）与渲染分离：
 * 解析覆盖 标题/粗体/斜体/行内代码/代码块/列表/引用/表格/分隔线/链接/图片。
 *
 * 渲染细节：
 * - 零依赖、纯 Taro 原生组件（View/Text/Image），H5 与微信小程序通用
 * - 链接点击复制到剪贴板（跨端稳妥，避免 H5/weapp 行为差异）
 */
import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { showToast } from './app-toast'
import { parseBlocks } from '../utils/markdown-parse'
import type { Block, InlineNode } from '../utils/markdown-parse'

// ───────────────────────── 渲染 ─────────────────────────

const C = {
  text: { fontSize: 14, lineHeight: 1.65, color: '#1A1A1A', wordBreak: 'break-word' as const },
  mono: { fontFamily: 'Consolas, Menlo, monospace' },
}

const copyLink = (url: string) => {
  Taro.setClipboardData({
    data: url,
    success: () => showToast({ title: '链接已复制', icon: 'none' }),
  })
}

function renderInline(nodes: InlineNode[], keyBase: string): React.ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyBase}-${idx}`
    switch (node.t) {
      case 'text':
        return <Text key={key} style={C.text}>{node.s}</Text>
      case 'bold':
        return (
          <Text key={key} style={{ ...C.text, fontWeight: 700 }}>
            {renderInline(node.c, key)}
          </Text>
        )
      case 'italic':
        return (
          <Text key={key} style={{ ...C.text, fontStyle: 'italic' }}>
            {renderInline(node.c, key)}
          </Text>
        )
      case 'strike':
        return (
          <Text key={key} style={{ ...C.text, textDecoration: 'line-through', color: '#999' }}>
            {renderInline(node.c, key)}
          </Text>
        )
      case 'code':
        return (
          <Text
            key={key}
            style={{
              ...C.text,
              ...C.mono,
              fontSize: 13,
              background: '#F2F3F5',
              padding: '1px 5px',
              borderRadius: 4,
            }}
          >
            {node.s}
          </Text>
        )
      case 'link':
        return (
          <Text
            key={key}
            style={{ ...C.text, color: '#1E88E5', textDecoration: 'underline' }}
            onClick={() => copyLink(node.url)}
          >
            {node.s}
          </Text>
        )
      default:
        return null
    }
  })
}

export interface MdRendererProps {
  source: string
  /** 流式光标（打字机） */
  cursor?: boolean
}

function renderBlock(block: Block, kb: string): React.ReactNode {
  switch (block.t) {
    case 'p':
      return <View key={kb} style={{ marginBottom: 4 }}>{renderInline(block.c, kb)}</View>
    case 'h': {
      const size = block.level === 1 ? 17 : block.level === 2 ? 16 : 15
      return (
        <View key={kb} style={{ marginTop: 8, marginBottom: 4, fontWeight: 700, fontSize: size, color: '#1A1A1A' }}>
          {renderInline(block.c, kb)}
        </View>
      )
    }
    case 'ul':
    case 'ol':
      return (
        <View key={kb} style={{ marginBottom: 4 }}>
          {block.items.map((item, ii) => (
            <View
              key={`${kb}-${ii}`}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', marginLeft: item.level * 14 }}
            >
              <Text style={{ ...C.text, width: 20, flexShrink: 0, color: '#555' }}>
                {block.t === 'ul' ? '•' : `${ii + 1}.`}
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>{renderInline(item.c, `${kb}-${ii}`)}</View>
            </View>
          ))}
        </View>
      )
    case 'quote':
      return (
        <View
          key={kb}
          style={{ borderLeft: '3px solid #81C784', background: '#F4FAF4', padding: '6px 10px', marginBottom: 6, borderRadius: 4 }}
        >
          {renderInline(block.c, kb)}
        </View>
      )
    case 'code':
      return (
        <View
          key={kb}
          style={{
            background: '#F6F8FA',
            borderRadius: 8,
            padding: 10,
            marginBottom: 6,
            overflow: 'hidden',
          }}
        >
          {block.lang ? (
            <Text style={{ display: 'block', fontSize: 11, color: '#999', marginBottom: 4, ...C.mono }}>{block.lang}</Text>
          ) : null}
          <Text
            style={{
              ...C.text,
              ...C.mono,
              fontSize: 13,
              color: '#24292E',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {block.text || ' '}
          </Text>
        </View>
      )
    case 'hr':
      return <View key={kb} style={{ borderTop: '1px solid #E8E8E8', margin: '8px 0' }} />
    case 'table':
      return (
        <View key={kb} style={{ marginBottom: 6, border: '1px solid #E6E6E6', borderRadius: 8, overflow: 'hidden' }}>
          <View style={{ display: 'flex', flexDirection: 'row', background: '#F5F5F5' }}>
            {block.header.map((hc, hi) => (
              <Text key={`h${hi}`} style={{ ...C.text, fontWeight: 700, flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 13 }}>
                {hc}
              </Text>
            ))}
          </View>
          {block.rows.map((row, ri) => (
            <View key={`r${ri}`} style={{ display: 'flex', flexDirection: 'row', borderTop: '1px solid #F0F0F0' }}>
              {row.map((cell, ci) => (
                <Text key={`c${ci}`} style={{ ...C.text, flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 13 }}>
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )
    case 'img':
      return (
        <Image
          key={kb}
          src={block.url}
          mode="widthFix"
          style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 6 }}
          onError={() => {}}
        />
      )
    default:
      return null
  }
}

export default function MdRenderer({ source, cursor }: MdRendererProps) {
  const blocks = parseBlocks(source)
  const isEmpty = blocks.length === 0

  return (
    <View>
      {cursor && isEmpty ? <Text style={C.text}>▌</Text> : blocks.map((block, bi) => renderBlock(block, `b${bi}`))}
      {cursor && !isEmpty ? <Text style={C.text}>▌</Text> : null}
    </View>
  )
}