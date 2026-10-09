// Основа: ConversationAtlas, hooks/ui/shared.tsx:66–236,291–319.
// Copyright (c) 2026 NeelAPatel, MIT; полный текст в THIRD_PARTY_NOTICES.md.
// Доработки Cockpit: целые графемы, явные приоритеты метаданных и времени.

const segmenter = new Intl.Segmenter('ru', { granularity: 'grapheme' })

export function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), part => part.segment)
}

export function cellWidth(value: string): number {
  let width = 0
  for (const cluster of graphemes(value)) {
    let cells = 0
    for (const ch of cluster) {
      const code = ch.codePointAt(0) ?? 0
      if (code === 0 || code < 32 || (code >= 0x7f && code < 0xa0) || /\p{Mark}/u.test(ch)
        || code === 0x200d || (code >= 0x1f3fb && code <= 0x1f3ff)) continue
      const wide = code >= 0x1100 && (
        code <= 0x115f || code === 0x2329 || code === 0x232a ||
        (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe10 && code <= 0xfe6f) ||
        (code >= 0xff01 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1faff) || (code >= 0x1f1e6 && code <= 0x1f1ff)
      )
      cells = Math.max(cells, wide ? 2 : 1)
    }
    if (cluster.includes('\ufe0f') || cluster.includes('\u20e3')) cells = Math.max(cells, 2)
    width += cells
  }
  return width
}

export function truncateCells(value: string, width: number): string {
  const limit = Math.max(1, Math.floor(width))
  if (cellWidth(value) <= limit) return value
  if (limit === 1) return '…'
  let out = ''
  for (const cluster of graphemes(value)) {
    if (cellWidth(`${out}${cluster}…`) > limit) break
    out += cluster
  }
  return `${out}…`
}
