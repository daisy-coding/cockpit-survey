import { expect, test } from 'claude-code/testing'
import Rows from '../hooks/rows'
import PanelActions from '../hooks/panel-actions'
import { emptyAnswers, parseSurvey, select } from '../hooks/survey'
import { initialView, surveyRows, visibleProps } from '../hooks/view'
import { DEFAULT_THEME, roleColors, rowFill } from '../hooks/theme'
import { SPEC } from './fixtures'

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown }
function nodes(tree: unknown): Node[] {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  const node = tree as Node
  return [node, ...nodes(node.children), ...nodes(node.props?.children)]
}
function textOf(tree: unknown): string {
  if (typeof tree === 'string') return tree
  if (Array.isArray(tree)) return tree.map(textOf).join('')
  if (!tree || typeof tree !== 'object') return ''
  const node = tree as Node
  return textOf(node.children ?? node.props?.children)
}
for (const bg of ['#ffffff', '#1e1e1e', '']) test(`Анкета использует роли и сохраняет результат на заливке: ${bg || 'неизвестный фон'}`, () => {
  const theme = { ...DEFAULT_THEME, bg }, roles = roleColors(theme, [rowFill(theme)]), allowed = new Set(Object.values(roles))
  const survey = parseSurvey(JSON.stringify(SPEC)), view = initialView(survey)
  let answers = emptyAnswers('colors', survey, '')
  answers = select(survey, answers, 0, 'pg')
  view.limit = 100
  const props = visibleProps(surveyRows(survey, answers, view, 80, 'plain', 'terminal'), view, theme)
  expect(props.activeBg).toBe(roles.fill)
  expect(props.hoverBg).toBe(roles.fill)
  const elements = { Box: (props: Record<string, unknown>) => ({ type: 'Box', props }), Text: (props: Record<string, unknown>) => ({ type: 'Text', props }), Button: (props: Record<string, unknown>) => ({ type: 'Button', props }) }
  const surface = { elements, columns: 80, rows: 100, setState: () => {}, every: () => () => {}, onPointer: () => () => {}, onKey: () => () => {}, post: () => {} }
  const draw = (hover: number) => Rows(props, { ...surface, state: { hover, phase: 0, drag: false, ref: {} } } as unknown as Parameters<typeof Rows>[1])
  const first = props.rows.find(row => row.id === 'q:0')!.left.find(seg => seg.c === roles.ok)!
  expect(first).toBeDefined()
  for (const hover of [-1, 0]) {
    const tree = nodes(draw(hover))
    expect(tree.find(node => node.type === 'Text' && textOf(node) === first.t)?.props?.color).toBe(roles.ok)
    for (const node of tree) if (node.props?.color) expect(allowed.has(String(node.props.color))).toBe(true)
  }
  const controls = PanelActions({ title: 'Анкета', accent: roles.accent, muted: roles.muted, actions: [{ key: 'send', label: '→', hint: 'Отправить', keyHint: 'Enter' }], hint: '', focused: 'send', plugin: 'survey' }, surface as unknown as Parameters<typeof PanelActions>[1])
  const button = nodes(controls).find(node => node.type === 'Button')!
  expect(button.props?.color).toBe(roles.muted)
  expect(button.props?.hover).toMatchObject({ color: roles.accent, inverse: false })
  const caption = nodes(controls).filter(node => node.type === 'Text' && node.props?.bold)
  for (const node of caption) { expect(node.props?.color).toBe(roles.accent); expect(node.props?.inverse).toBeUndefined() }
})
