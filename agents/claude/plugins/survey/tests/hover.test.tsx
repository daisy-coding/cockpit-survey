import { expect, test } from 'claude-code/testing'
import Rows from '../hooks/rows'
import PanelActions from '../hooks/panel-actions'
import { emptyAnswers, parseSurvey } from '../hooks/survey'
import { initialView, surveyRows, visibleProps } from '../hooks/view'
import { command, host, PANE, SPEC } from './fixtures'

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown; hover?: unknown }
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  const node = tree as Node
  return [node, ...nodes(node.children ?? node.props?.children)]
}
const elements = {
  Box: (props: Record<string, unknown>) => ({ type: 'Box', props }),
  Text: (props: Record<string, unknown>) => ({ type: 'Text', props }),
  Button: (props: Record<string, unknown>) => ({ type: 'Button', props }),
}
const surface = { elements, columns: 40, rows: 100, setState: () => {}, every: () => () => {}, onPointer: () => () => {}, onKey: () => () => {}, post: () => {} }

test('Наведение: описания и вопросы неизменны, область метки варианта общая', () => {
  const survey = parseSurvey(JSON.stringify({ ...SPEC, questions: [{ ...SPEC.questions[0], options: [
    { ...SPEC.questions[0]!.options[0], detail: 'Описание варианта переносится в несколько строк '.repeat(3) },
  ] }] }))
  const view = initialView(survey)
  view.details.add('o:0:0'); view.limit = 100
  const props = visibleProps(surveyRows(survey, emptyAnswers('arch', survey, ''), view, 40, 'plain', 'terminal'), view)
  const draw = (hover: number) => Rows(props, { ...surface, state: { hover, phase: 0, drag: false, ref: {} } } as unknown as Parameters<typeof Rows>[1])
  const rowTree = (hover: number, index: number) => {
    const root = draw(hover) as unknown as Node
    return (root.props?.children as unknown[])[index]
  }
  for (const [index, row] of props.rows.entries()) {
    if (!row.id || row.id.startsWith('q:')) {
      expect(nodes(rowTree(index, index)).every(node => node.props?.hover === undefined)).toBe(true)
      expect(rowTree(index, index)).toEqual(rowTree(-1, index))
    }
  }
  const option = props.rows.findIndex(row => row.id === 'o:0:0')
  const scopes = nodes(rowTree(option, option)).map(node => (node.props?.hover as { scope?: string } | undefined)?.scope).filter(Boolean)
  expect(new Set(scopes).size).toBe(1)
  expect(scopes.length).toBeGreaterThan(0)
})

test('Фокус значка не показывает подпись: она связана только с наведением', () => {
  const tree = nodes(PanelActions({ title: 'Анкета', accent: '#8553f6', muted: '#777777', actions: [
    { key: 'send', label: '↑', hint: 'Отправить ответы', keyHint: 'Tab Enter' },
  ], hint: '', focused: 'send', plugin: 'survey' }, surface as unknown as Parameters<typeof PanelActions>[1]))
  expect(tree.find(node => node.props?.key === 'caption-send')?.props?.display).toBe('none')
  expect(tree.find(node => node.props?.key === 'caption-send')?.props?.hover).toMatchObject({ scope: 'survey-action-send', display: 'flex' })
})

test('Родное дерево: вопрос и описания без hover, метка варианта с hover', async ($, on) => {
  host(on)
  await $.command.run(command())
  const pane = await $.ui.mount({ plugin: 'survey', surface: 'vscode', component: 'Pane', requestId: 'survey', props: PANE })
  const tree = nodes(await pane.drawn())
  expect(tree.find(node => node.props?.key === 'q:0')?.hover).toBeUndefined()
  expect(tree.find(node => node.props?.key === 'o:0:0')?.hover).toBeDefined()
  for (const node of tree) if (node.type === 'Text') expect(node.hover).toBeUndefined()
  for (const key of ['send', 'reset', 'close']) {
    const caption = tree.find(node => node.props?.key === `caption-${key}`)
    expect(caption?.props?.display).toBe('none')
    expect(caption?.hover).toMatchObject({ scope: `survey-header-${key}`, display: 'flex' })
  }
  await pane.unmount()
})
