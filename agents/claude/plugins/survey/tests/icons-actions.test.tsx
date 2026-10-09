import { expect, test } from 'claude-code/testing'
import PanelActions, { actionCaption, actionHint, type PanelActionsProps } from '../hooks/panel-actions'
import { ICON } from '../hooks/icons'

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown }
function nodes(tree: unknown): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  const node = tree as Node
  return [node, ...nodes(node.children ?? node.props?.children)]
}
function textOf(tree: unknown): string {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  if (Array.isArray(tree)) return tree.map(textOf).join('')
  if (!tree || typeof tree !== 'object') return ''
  const node = tree as Node
  return textOf(node.children ?? node.props?.children)
}
const elements = {
  Box: (props: Record<string, unknown>) => ({ type: 'Box', props }),
  Text: (props: Record<string, unknown>) => ({ type: 'Text', props }),
  Button: (props: Record<string, unknown>) => ({ type: 'Button', props }),
}

for (const glyphs of ['nerd', 'plain'] as const) for (const width of [40, 60, 100]) {
  test(`Подпись действия повторяет значок, hover скрыт до наведения: ${glyphs}, ${width}`, () => {
    const labels = [ICON.send[glyphs], ICON.reset[glyphs], ICON.close[glyphs]]
    const actions = labels.map((label, index) => ({ key: `command-${index}`, label, hint: 'Действие', keyHint: index === 0 ? 'r' : '' }))
    const props: PanelActionsProps = { title: 'Панель', accent: '#8553f6', muted: '#777777', actions, hint: '', focused: '', plugin: 'survey' }
    const draw = (focused = '') => PanelActions({ ...props, focused }, {
      elements, columns: width, rows: 1, onKey: () => () => {}, onPointer: () => () => {}, setState: () => {},
    } as unknown as Parameters<typeof PanelActions>[1])
    const tree = nodes(draw())
    for (const action of actions) {
      const caption = tree.find(node => node.props?.key === `caption-${action.key}`)!
      const button = tree.find(node => node.type === 'Button' && node.props?.key === action.key)!
      const expected = action.label + ' Действие' + (action.keyHint ? '  [r]' : '')
      expect(actionCaption(action)).toBe(expected)
      expect(actionHint(actions, action.key, props.title)).toBe(expected)
      expect(textOf(caption).trimEnd()).toBe(expected)
      expect(caption.props?.display).toBe('none')
      const scope = (button.props?.hover as { scope: string }).scope
      expect(caption.props?.hover).toMatchObject({ scope, display: 'flex' })
      expect(nodes(draw(action.key)).find(node => node.props?.key === `caption-${action.key}`)?.props?.display).toBe('none')
    }
    expect(actionHint(actions, 'missing', props.title)).toBe(props.title)
  })
}
