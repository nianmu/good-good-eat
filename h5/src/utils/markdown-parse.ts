/**
 * 轻量 Markdown 解析器（纯函数、零依赖、跨端通用）——好好吃饭
 *
 * 只做「文本 → 节点树」的解析，不依赖 React/Taro 组件，
 * 由 md-renderer.tsx 负责渲染；纯函数可独立单测（Node 直接跑）。
 *
 * 覆盖：标题 / 粗体 / 斜体 / 行内代码 / 代码块 / 列表 / 引用 / 表格 / 分隔线 / 链接 / 图片。
 * 行内递归深度限制，防止极端输入导致爆栈。
 */

// ───────────────────────── 节点类型（导出供渲染器使用）─────────────────────────

export interface TextNode { t: 'text'; s: string }
export interface StyleNode { t: 'bold' | 'italic' | 'strike'; c: InlineNode[] }
export interface CodeNode { t: 'code'; s: string }
export interface LinkNode { t: 'link'; s: string; url: string }
export type InlineNode = TextNode | StyleNode | CodeNode | LinkNode

export interface PBlock { t: 'p'; c: InlineNode[] }
export interface HBlock { t: 'h'; level: number; c: InlineNode[] }
export interface ListItem { level: number; c: InlineNode[] }
export interface ListBlock { t: 'ul' | 'ol'; items: ListItem[] }
export interface QuoteBlock { t: 'quote'; c: InlineNode[] }
export interface CodeBlock { t: 'code'; lang?: string; text: string }
export interface HrBlock { t: 'hr' }
export interface TableBlock { t: 'table'; header: string[]; rows: string[][] }
export interface ImgBlock { t: 'img'; alt: string; url: string }
export type Block =
  | PBlock | HBlock | ListBlock | QuoteBlock | CodeBlock | HrBlock | TableBlock | ImgBlock

// ───────────────────────── 行内解析 ─────────────────────────

const MAX_INLINE_DEPTH = 3

const INLINE_RE = /\*\*([^*\n]+?)\*\*|__([^_\n]+?)__|\*([^*\n]+?)\*|`([^`\n]+)`|~~([^~\n]+?)~~|\[([^\]\n]+)\]\(([^)\s]+)\)/g

/** 行内解析：粗体/斜体/行内代码/删除线/链接，递归一层支持嵌套 */
function parseInline(source: string, depth = 0): InlineNode[] {
  if (depth > MAX_INLINE_DEPTH) return [{ t: 'text', s: source }]
  const nodes: InlineNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(source)) !== null) {
    if (m.index > last) nodes.push({ t: 'text', s: source.slice(last, m.index) })
    const [full, b1, b2, i1, code, s1, linkText, linkUrl] = m
    if (b1 !== undefined) {
      nodes.push({ t: 'bold', c: parseInline(b1, depth + 1) })
    } else if (b2 !== undefined) {
      nodes.push({ t: 'bold', c: parseInline(b2, depth + 1) })
    } else if (i1 !== undefined) {
      nodes.push({ t: 'italic', c: parseInline(i1, depth + 1) })
    } else if (code !== undefined) {
      nodes.push({ t: 'code', s: code })
    } else if (s1 !== undefined) {
      nodes.push({ t: 'strike', c: [{ t: 'text', s: s1 }] })
    } else if (linkText !== undefined && linkUrl !== undefined) {
      nodes.push({ t: 'link', s: linkText, url: linkUrl })
    }
    last = m.index + full.length
  }
  if (last < source.length) nodes.push({ t: 'text', s: source.slice(last) })
  return nodes
}

// ───────────────────────── 块级解析 ─────────────────────────

const isBlockStart = (line: string): boolean =>
  /^(#{1,4})\s+/.test(line) ||
  /^```/.test(line.trim()) ||
  /^\s*>\s?/.test(line) ||
  /^\s*[-*+]\s+/.test(line) ||
  /^\s*\d+[.)]\s+/.test(line) ||
  /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) ||
  (line.includes('|') && /^\s*\|/.test(line)) ||
  /^!\[[^\]]*\]\([^)\s]+\)\s*$/.test(line)

const splitTableRow = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

const isTableSep = (line: string): boolean =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line.trim())

/** 块级解析：文本 → Block[] */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  const n = lines.length

  while (i < n) {
    const line = lines[i]

    // 代码块
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim()
      const buf: string[] = []
      i++
      while (i < n && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i])
        i++
      }
      i++ // 跳过收尾 ```
      blocks.push({ t: 'code', lang, text: buf.join('\n') })
      continue
    }

    // 空白行
    if (!line.trim()) { i++; continue }

    // 分隔线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ t: 'hr' })
      i++
      continue
    }

    // 标题
    const hm = /^(#{1,4})\s+(.*)$/.exec(line)
    if (hm) {
      blocks.push({ t: 'h', level: hm[1].length, c: parseInline(hm[2]) })
      i++
      continue
    }

    // 引用（合并连续 > 行）
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = []
      while (i < n && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ t: 'quote', c: parseInline(buf.join('\n')) })
      continue
    }

    // 表格（含分隔行）
    if (line.includes('|') && i + 1 < n && isTableSep(lines[i + 1])) {
      const header = splitTableRow(line)
      i += 2
      const rows: string[][] = []
      while (i < n && lines[i].includes('|') && lines[i].trim() && !isTableSep(lines[i])) {
        rows.push(splitTableRow(lines[i]))
        i++
      }
      blocks.push({ t: 'table', header, rows })
      continue
    }

    // 图片行
    const imgM = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line)
    if (imgM) {
      blocks.push({ t: 'img', alt: imgM[1], url: imgM[2] })
      i++
      continue
    }

    // 列表（合并连续项，支持两级缩进）
    const ulM = /^(\s*)[-*+]\s+(.*)$/.exec(line)
    const olM = /^(\s*)\d+[.)]\s+(.*)$/.exec(line)
    if (ulM || olM) {
      const ordered = !!olM
      const items: ListItem[] = []
      const pushItem = (indent: string, content: string) =>
        items.push({ level: Math.floor(indent.length / 2), c: parseInline(content) })
      while (i < n) {
        const cur = lines[i]
        const um = /^(\s*)[-*+]\s+(.*)$/.exec(cur)
        const om = /^(\s*)\d+[.)]\s+(.*)$/.exec(cur)
        if (ordered && om) {
          pushItem(om[1], om[2])
          i++
        } else if (!ordered && um) {
          pushItem(um[1], um[2])
          i++
        } else if (cur.trim() === '') {
          // 空行：下一行仍是同类列表则继续，否则结束
          const next = lines[i + 1]
          const nm = ordered ? /^(\s*)\d+[.)]\s+/.test(next ?? '') : /^(\s*)[-*+]\s+/.test(next ?? '')
          if (!next || !nm) break
          i++
        } else {
          break
        }
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items })
      continue
    }

    // 普通段落：收集到空行或下一个块级起点
    const buf: string[] = [line]
    i++
    while (i < n && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ t: 'p', c: parseInline(buf.join('\n')) })
  }

  return blocks
}