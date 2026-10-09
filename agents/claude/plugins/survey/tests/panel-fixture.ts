import type { Mounted } from 'claude-code/testing'

type PanelMount = Pick<Mounted, 'drawn' | 'find'>
type FoundElement = NonNullable<Awaited<ReturnType<PanelMount['find']>>>

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!node || typeof node !== 'object') return ''
  const item = node as { props?: Record<string, unknown>; children?: unknown }
  return (typeof item.props?.label === 'string' ? item.props.label : '') + textOf(item.children)
}
export async function panelText(pane: PanelMount): Promise<string> {
  const tree = await pane.drawn()
  const header = await pane.find({ type: 'Client', key: 'panel-header' })
  return textOf(tree) + (header ? textOf(await pane.drawn({ in: 'panel-header' })) : '')
}
export async function findPanelAction(pane: PanelMount, key: string): Promise<FoundElement | undefined> {
  const native = await pane.find({ type: 'Button', key })
  if (native) return native
  if (!await pane.find({ type: 'Client', key: 'panel-header' })) return undefined
  const visit = (node: unknown): FoundElement | undefined => {
    if (Array.isArray(node)) { for (const child of node) { const found = visit(child); if (found) return found }; return undefined }
    if (!node || typeof node !== 'object') return undefined
    const item = node as { type?: string; props?: Record<string, unknown>; key?: string; children?: unknown[] }
    if (item.type === 'Button' && (item.key ?? item.props?.key) === key) {
      return { type: 'Button', key, props: item.props ?? {}, text: textOf(item), children: item.children ?? [] }
    }
    return visit(item.children)
  }
  return visit(await pane.drawn({ in: 'panel-header' }))
}
