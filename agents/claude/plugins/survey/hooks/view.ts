import type { RowSpec, RowsProps, Seg } from './rows'
import type { Answers, Survey } from './survey'
import { answered } from './survey'
import { glyph, type Glyphs } from './icons'
import { cellWidth, graphemes, truncateCells } from './layout'

import { DEFAULT_THEME as THEME, activityTones, applyTheme, withGutter, roleColors, rowFill, type Theme } from './theme'
export { DEFAULT_THEME as THEME } from './theme'
export type View = { cursor: string; hover: string; expanded: Set<number>; details: Set<string>; offset: number; limit: number }
export type SurveyRow = RowSpec & { question?: number; option?: number; field?: boolean; group?: boolean; parent?: string }
export function initialView(survey: Survey): View {
  return { cursor: 'q:0', hover: '', expanded: new Set(survey.questions.map((_, i) => i)), details: new Set(), offset: 0, limit: 12 }
}
export function wrapCells(value: string, width: number): string[] {
  const limit = Math.max(1, Math.floor(width))
  const lines: string[] = []
  let line = ''
  for (const word of value.trim().split(/\s+/u)) {
    if (!word) continue
    if (line && cellWidth(line + ' ' + word) <= limit) { line += ' ' + word; continue }
    if (line) { lines.push(line); line = '' }
    let used = 0
    for (const cluster of graphemes(word)) {
      const cells = cellWidth(cluster)
      if (line && used + cells > limit) { lines.push(line); line = ''; used = 0 }
      line += cluster
      used += cells
    }
  }
  if (line) lines.push(line)
  return lines
}
export function surveyRows(survey: Survey, state: Answers, view: View, width: number, glyphs: Glyphs, surface: string): SurveyRow[] {
  const roles = roleColors(THEME)
  width = Math.max(1, width - 3)
  const rows: SurveyRow[] = []
  const icon = (name: Parameters<typeof glyph>[0]) => glyph(name, glyphs, surface)
  const detail = (value: string | undefined, indent: string, hoverId = '') => {
    if (value) for (const line of wrapCells(value, width - cellWidth(indent) - 1)) {
      rows.push({ id: '', hoverId, left: [{ t: indent + line, c: roles.muted }], right: [] })
    }
  }
  detail(survey.intro, '')
  survey.questions.forEach((q, qi) => {
    const a = state.answers[qi]
    const id = `q:${qi}`
    const open = view.expanded.has(qi)
    const head = `${icon(open ? 'open' : 'closed')} ${icon(answered(q, a) ? 'done' : 'pending')} `
    rows.push({ id, question: qi, group: true, left: [
      { t: head, c: answered(q, a) ? roles.ok : roles.fg },
      { t: truncateCells(q.title, width - cellWidth(head) - 1), b: true },
    ], right: [] })
    if (!open) return
    if (view.cursor === id && cellWidth(q.title) > width - cellWidth(head) - 1) detail(q.title, '    ', id)
    detail(q.detail, '    ', id)
    if (q.kind !== 'text') q.options.forEach((o, oi) => {
      const rowId = `o:${qi}:${oi}`
      const checked = a?.selected.includes(o.id)
      const prefix = `    ${icon(q.kind === 'single' ? checked ? 'radio' : 'radioEmpty' : checked ? 'check' : 'checkEmpty')} `
      const right: Seg[] = o.recommended ? [{ t: ` ${icon('recommended')}${width >= 48 ? ' рекомендовано' : ''}`, c: roles.ok }] : []
      const room = width - cellWidth(prefix) - right.reduce((sum, seg) => sum + cellWidth(seg.t), 0) - 1
      rows.push({ id: rowId, question: qi, option: oi, parent: id,
        left: [{ t: prefix, c: checked ? roles.ok : roles.muted }, { t: truncateCells(o.label, room), b: checked }], right })
      if (view.cursor === rowId || view.hover === rowId || view.details.has(rowId)) {
        if (cellWidth(o.label) > room) detail(o.label, '      ', rowId)
        detail(o.detail, '      ', rowId)
      }
    })
    if (q.kind === 'text' || q.allowOther) {
      const rowId = `${q.kind === 'text' ? 'text' : 'other'}:${qi}`
      const value = q.kind === 'text' ? a?.text : a?.other
      const prefix = `    ${icon(value ? 'done' : 'text')} `
      const title = q.kind === 'text' ? value || 'Ввести ответ…' : value ? `Свой вариант: ${value}` : 'Свой вариант…'
      rows.push({ id: rowId, question: qi, field: true, parent: id,
        left: [{ t: prefix, c: value ? roles.ok : roles.muted }, { t: truncateCells(title, width - cellWidth(prefix) - 1) }], right: [] })
      if (value && view.cursor === rowId) detail(value, '      ', rowId)
    }
  })
  return withGutter(rows)
}
export function visibleProps(rows: SurveyRow[], view: View, theme: Theme = THEME): RowsProps {
  const roles = roleColors(theme, [rowFill(theme)])
  const cursorAt = rows.findIndex(row => row.id === view.cursor)
  if (view.offset < 0) view.offset = 0
  view.offset = Math.min(view.offset, Math.max(0, rows.length - view.limit))
  const shown = rows.slice(view.offset, view.offset + view.limit)
  const track = rows.length > view.limit
  const size = Math.max(1, Math.round(view.limit * view.limit / Math.max(1, rows.length)))
  const pos = Math.round(view.offset / Math.max(1, rows.length - view.limit) * (view.limit - size))
  return { rows: applyTheme(shown, theme, roles), active: cursorAt >= 0 ? view.cursor : '', activeBg: roles.fill, hoverBg: roles.fill, hoverColor: roles.accent, neutral: [roles.fg, roles.muted],
    tones: { survey: activityTones(theme) }, detailHover: true, ...(track ? { bar: { pos, size, thumb: roles.accent, track: roles.muted } } : {}) }
}
export function reveal(rows: SurveyRow[], view: View): void {
  const at = rows.findIndex(row => row.id === view.cursor)
  if (at < view.offset) view.offset = Math.max(0, at)
  else if (at >= view.offset + view.limit) view.offset = at - view.limit + 1
}
export function move(rows: SurveyRow[], view: View, key: string): void {
  const items = rows.filter(row => row.id)
  const at = Math.max(0, items.findIndex(row => row.id === view.cursor))
  const delta = ['up', 'k', 'pageup'].includes(key) ? -1 : 1
  const to = ['home', 'g'].includes(key) ? 0 : ['end', 'G'].includes(key) ? items.length - 1
    : at + delta * (key === 'pageup' || key === 'pagedown' ? view.limit : 1)
  view.cursor = items[Math.max(0, Math.min(items.length - 1, to))]?.id ?? ''
  reveal(rows, view)
}
