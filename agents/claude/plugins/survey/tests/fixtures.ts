import { mock } from 'claude-code/testing'
import type { CommandRunInput, On, PaneOpenArgs, PromptFillArgs, PromptSubmitInput, RenderChildren, RenderPropsOf } from 'claude-code'
import type { Answers } from '../hooks/survey'

export const SPEC = { version: 1, title: 'Архитектура', intro: 'Выберите границы системы', questions: [
  { id: 'db', title: 'Хранилище', detail: 'Данные остаются в проекте', kind: 'single', options: [
    { id: 'pg', label: 'PostgreSQL', detail: 'Отдельный сервер', recommended: true }, { id: 'sqlite', label: 'SQLite', detail: 'Локальный файл' },
  ] },
  { id: 'features', title: 'Возможности', kind: 'multi', options: [{ id: 'api', label: 'API' }, { id: 'export', label: 'Экспорт' }] },
  { id: 'notes', title: 'Ограничения', kind: 'text' },
] }
export const PANE: RenderPropsOf['Pane'] = { title: 'Survey', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 32 }, view: {} }
export const BAND: RenderPropsOf['AbovePrompt'] = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} }
export function command(args = ''): CommandRunInput {
  return { command: 'survey', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 80 } }
}
export function drawnText(node: RenderChildren): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(item => drawnText(item)).join('')
  return node && typeof node === 'object' && 'children' in node ? drawnText(node.children) : ''
}
export function host(on: On, source: unknown = SPEC) {
  mock.clock(on, { now: Date.parse('2026-10-05T12:00:00Z') })
  const files = new Map<string, string>()
  // Явный тип разрывает круг вывода: fixture содержит path, а path по умолчанию читает fixture.cwd.
  const path: (id: string, suffix?: string, root?: string) => string = (id, suffix = '', root = fixture.cwd) => `${root}/.cockpit/surveys/${id}${suffix}.json`
  const opens: PaneOpenArgs[] = []; const toasts: string[] = []; const fills: PromptFillArgs[] = []
  const requests: { root: string; op: string; id?: string; text?: string }[] = []
  const argv: (readonly string[])[] = []; const submitted: string[] = []; const events: string[] = []; const models: string[] = []
  const prompts: PromptSubmitInput[] = []
  const fixture = { cwd: '/fixture', sessionId: 'session-one', placed: true, fillable: true, draft: '', failWrite: false, brokenProcess: false, denyWrite: false, dropPrompt: false,
    files, opens, toasts, fills, requests, argv, submitted, events, models, prompts, links: new Set<string>(), blockedRoots: new Set<string>(),
    path, answers(id = 'arch'): Answers | undefined { const raw = files.get(path(id, '.answers')); return raw ? JSON.parse(raw) : undefined } }
  if (source !== null) files.set(path('arch'), typeof source === 'string' ? source : JSON.stringify(source))
  on('session.cwd', () => ({ value: fixture.cwd }))
  on('session.id', () => ({ value: fixture.sessionId }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('fs.read', (_$, e) => ({ value: e.path.endsWith('/hooks/files.py') ? '# доверенный код фикстуры' : files.get(e.path) ?? '' }))
  on('process.run', (_$, e) => {
    if (fixture.brokenProcess) throw new Error('PRIVATE failure')
    argv.push(e.argv)
    const request = JSON.parse(e.init?.stdin ?? '{}'); requests.push(request)
    let response: unknown
    const file = path(request.id ?? '', request.op === 'read' ? '' : '.answers', request.root)
    if (fixture.blockedRoots.has(request.root) || fixture.links.has(file)) response = { error: 'symlink' }
    else if (request.op === 'list') response = { entries: [...files.keys()].filter(p => p.startsWith(request.root + '/.cockpit/surveys/') && !p.endsWith('.answers.json'))
      .map((p, i) => ({ id: p.split('/').pop()!.slice(0, -5), mtimeMs: i + 1, isLink: fixture.links.has(p) })) }
    else if (request.op === 'write') {
      if (fixture.failWrite) response = { error: 'io' }
      else { files.set(file, request.text); response = { saved: true } }
    } else response = { text: files.get(file) ?? null }
    return { value: { exitCode: 0, stdout: JSON.stringify(response), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', (_$, e) => { opens.push(e); events.push('open'); return { value: fixture.placed ? { isPlaced: true } : { isPlaced: false, reason: 'narrow' } } })
  on('ui.close', () => { events.push('close'); return { value: undefined } })
  on('ui.panes', () => ({ value: [] }))
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('prompt.read', () => ({ value: { text: fixture.draft, cursor: fixture.draft.length } }))
  on('prompt.fill', (_$, e) => { fills.push(e); events.push('fill'); return { isFilled: fixture.fillable } })
  on('prompt.submit', (_$, e) => { submitted.push(e.text); prompts.push(e); return fixture.dropPrompt ? { drop: 'отказ фикстуры' } : { text: e.text, context: e.context } })
  on('model.complete', () => { models.push('complete'); throw new Error('модель не должна вызываться') })
  on('model.fork', () => { models.push('fork'); throw new Error('модель не должна вызываться') })
  on('tool.call', { tool: 'Write' }, (_$, e) => {
    if (fixture.denyWrite) return { deny: 'отказ фикстуры' }
    files.set(e.file_path, e.content); events.push('write')
    return { result: { type: 'create', filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } }
  })
  on('tool.call', { tool: 'Edit' }, (_$, e) => {
    files.set(e.file_path, (files.get(e.file_path) ?? '').replace(e.old_string, e.new_string)); events.push('edit')
    return { result: { filePath: e.file_path, oldString: e.old_string, newString: e.new_string, originalFile: '', structuredPatch: [], userModified: false, replaceAll: false } }
  })
  return fixture
}
