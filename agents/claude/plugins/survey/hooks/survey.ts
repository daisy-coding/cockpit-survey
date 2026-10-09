import { createSecretView } from './secret-view'

// Из общего модуля берётся только правило невидимости. Секреты в тексте анкеты не ищутся:
// ответ владельца доходит до агента таким, каким введён.
const textView = createSecretView([], text => text)

export const LIMIT = { bytes: 256 * 1024, questions: 40, options: 12, title: 300, detail: 2000 } as const
export type Option = { id: string; label: string; detail?: string; recommended?: boolean }
export type Question = { id: string; title: string; detail?: string; kind: 'single' | 'multi' | 'text'; options: Option[]; allowOther: boolean }
export type Survey = { version: 1; title: string; intro?: string; questions: Question[] }
export type Answer = { questionId: string; selected: string[]; other?: string; text?: string }
export type Answers = { version: 1; surveyId: string; complete: boolean; answers: Answer[]; updatedAt: string }

export class SurveyError extends Error {}
const fail = (reason: string): never => { throw new SurveyError(reason) }
export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
}
export function byteLength(value: string): number {
  let bytes = 0
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}
// Данные не становятся управляющими последовательностями терминала или bidi-разметкой.
export function clean(value: string, limit: number = LIMIT.detail, trim = true): string {
  const safe = textView.clean(value, { multiline: true }).replace(/\n/gu, ' ')
  const out = Array.from(safe).slice(0, limit).join('')
  return trim ? out.trim() : out
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail('ожидался объект')
}
function text(value: unknown, limit: number, required = false): string {
  if (typeof value !== 'string') return fail('ожидалась строка')
  const safe = clean(value, limit)
  if (required && !safe) return fail('пустой заголовок или идентификатор')
  return safe
}
// Идентификаторы вопросов и вариантов попадают в файл ответов, который читает агент:
// это не свободный текст, а короткое имя — иначе в них можно положить инструкцию.
function ident(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value) ? value : fail('идентификатор: латиница, цифры, - или _, до 64 знаков')
}
function optional(value: unknown): { detail?: string } {
  return value === undefined ? {} : { detail: text(value, LIMIT.detail) }
}
function flag(value: unknown, fallback: boolean): boolean {
  return value === undefined ? fallback : typeof value === 'boolean' ? value : fail('ожидался логический флаг')
}
function json(raw: string): unknown {
  if (byteLength(raw) > LIMIT.bytes) return fail('файл больше 256 КБ')
  try { return JSON.parse(raw) } catch { return fail('битый JSON') }
}
export function parseSurvey(raw: string): Survey {
  const value = record(json(raw))
  if (value.version !== 1) return fail('неподдерживаемая версия')
  if (!Array.isArray(value.questions) || !value.questions.length || value.questions.length > LIMIT.questions) return fail('нужно от 1 до 40 вопросов')
  const ids = new Set<string>()
  const questions: Question[] = value.questions.map(item => {
    const q = record(item)
    const id = ident(q.id)
    if (ids.has(id)) return fail('повтор идентификатора вопроса')
    ids.add(id)
    if (q.kind !== 'single' && q.kind !== 'multi' && q.kind !== 'text') return fail('неизвестный вид вопроса')
    const kind = q.kind
    const allowOther = kind === 'text' ? false : flag(q.allowOther, true)
    if (q.options !== undefined && !Array.isArray(q.options)) return fail('ожидался список вариантов')
    const source = (q.options as unknown[] | undefined) ?? []
    if (source.length > LIMIT.options) return fail('больше 12 вариантов')
    if (kind === 'text' && source.length) return fail('текстовый вопрос не содержит вариантов')
    if (kind !== 'text' && !source.length && !allowOther) return fail('нет вариантов ответа')
    const optionIds = new Set<string>()
    const options: Option[] = source.map(item => {
      const o = record(item)
      const optionId = ident(o.id)
      if (optionIds.has(optionId)) return fail('повтор идентификатора варианта')
      optionIds.add(optionId)
      return { id: optionId, label: text(o.label, LIMIT.title, true), ...optional(o.detail),
        ...(o.recommended === undefined ? {} : { recommended: flag(o.recommended, false) }) }
    })
    return { id, title: text(q.title, LIMIT.title, true), ...optional(q.detail), kind, options, allowOther }
  })
  return { version: 1, title: text(value.title, LIMIT.title, true),
    ...(value.intro === undefined ? {} : { intro: text(value.intro, LIMIT.detail) }), questions }
}
export function emptyAnswers(surveyId: string, survey: Survey, updatedAt: string): Answers {
  if (!validId(surveyId)) return fail('неверный id анкеты')
  return { version: 1, surveyId, complete: false, answers: survey.questions.map(q => ({ questionId: q.id, selected: [] })), updatedAt }
}
export function parseAnswers(raw: string, surveyId: string, survey: Survey): Answers {
  const value = record(json(raw))
  if (value.version !== 1 || !validId(value.surveyId) || value.surveyId !== surveyId) return fail('ответы другой анкеты или версии')
  if (!Array.isArray(value.answers) || value.answers.length > LIMIT.questions) return fail('неверный список ответов')
  const complete = flag(value.complete, false)
  const updatedAt = text(value.updatedAt, LIMIT.title, true)
  if (!Number.isFinite(Date.parse(updatedAt))) return fail('неверная дата ответов')
  const held = new Map<string, Answer>()
  for (const item of value.answers) {
    const a = record(item)
    const questionId = text(a.questionId, LIMIT.title, true)
    if (held.has(questionId)) return fail('повтор ответа')
    if (!Array.isArray(a.selected) || a.selected.length > LIMIT.options) return fail('неверный выбор')
    const selected = a.selected.map(item => text(item, LIMIT.title, true))
    if (new Set(selected).size !== selected.length) return fail('повтор выбранного варианта')
    held.set(questionId, { questionId, selected,
      ...(a.other === undefined ? {} : { other: text(a.other, LIMIT.detail) }),
      ...(a.text === undefined ? {} : { text: text(a.text, LIMIT.detail) }) })
  }
  const answers = survey.questions.map(q => {
    const old = held.get(q.id)
    if (!old) return { questionId: q.id, selected: [] }
    if (q.kind === 'text') return { questionId: q.id, selected: [], ...(old.text ? { text: old.text } : {}) }
    const selected = old.selected.filter(id => q.options.some(o => o.id === id))
    const other = q.allowOther && old.other ? old.other : undefined
    return { questionId: q.id, selected: q.kind === 'single' ? (other ? [] : selected.slice(0, 1)) : selected, ...(other ? { other } : {}) }
  })
  return { version: 1, surveyId, complete, answers, updatedAt }
}
export function answered(question: Question, answer: Answer | undefined): boolean {
  if (!answer) return false
  return question.kind === 'text' ? Boolean(answer.text?.trim()) : answer.selected.length > 0 || Boolean(question.allowOther && answer.other?.trim())
}
export function missing(survey: Survey, state: Answers): number[] {
  return survey.questions.flatMap((q, i) => answered(q, state.answers[i]) ? [] : [i])
}
export function select(survey: Survey, state: Answers, index: number, optionId: string): Answers {
  const q = survey.questions[index]
  const a = state.answers[index]
  if (!q || !a || q.kind === 'text' || !q.options.some(o => o.id === optionId)) return fail('неизвестный вариант')
  const selected = q.kind === 'single' ? [optionId] : a.selected.includes(optionId) ? a.selected.filter(id => id !== optionId) : [...a.selected, optionId]
  return { ...state, complete: false, answers: state.answers.map((held, i) => i === index
    ? { questionId: q.id, selected, ...(q.kind === 'multi' && a.other ? { other: a.other } : {}) } : held) }
}
export function enterText(survey: Survey, state: Answers, index: number, raw: string): Answers {
  const q = survey.questions[index]
  const a = state.answers[index]
  if (!q || !a || (q.kind !== 'text' && !q.allowOther)) return fail('свой ответ недоступен')
  // Пробел в конце черновика нужен для следующего слова при посимвольном вводе.
  const value = clean(raw, LIMIT.detail, false)
  const changed: Answer = q.kind === 'text' ? { questionId: q.id, selected: [], ...(value ? { text: value } : {}) }
    : { questionId: q.id, selected: q.kind === 'single' && value ? [] : a.selected, ...(value ? { other: value } : {}) }
  return { ...state, complete: false, answers: state.answers.map((held, i) => i === index ? changed : held) }
}
export function serialize(state: Answers, updatedAt: string): string {
  const raw = JSON.stringify({ ...state, updatedAt }, null, 2) + '\n'
  if (byteLength(raw) > LIMIT.bytes) return fail('ответы больше 256 КБ')
  return raw
}
export function surveyPath(surveyId: string, answers = false): string {
  if (!validId(surveyId)) return fail('неверный id анкеты')
  return `.cockpit/surveys/${surveyId}${answers ? '.answers' : ''}.json`
}
export function writtenSurvey(cwd: string, path: string): { inside: boolean; id?: string } {
  const prefix = '.cockpit/surveys/'
  const root = cwd.replace(/\/+$/, '')
  const relative = path.startsWith(root + '/') ? path.slice(root.length + 1) : path.replace(/^\.\//, '')
  if (!relative.startsWith(prefix) || relative.includes('/../') || relative.slice(prefix.length).includes('/')) return { inside: false }
  const name = relative.slice(prefix.length)
  if (name.endsWith('.answers.json') || !name.endsWith('.json')) return { inside: false }
  const id = name.slice(0, -5)
  return { inside: true, ...(validId(id) ? { id } : {}) }
}
