import { SurveyError, validId } from './survey'

export type Entry = { id: string; mtimeMs: number; isLink: boolean }
const REASON: Record<string, string> = {
  symlink: 'симлинки запрещены', file: 'нужен обычный файл', size: 'файл больше 256 КБ',
  missing: 'файл не найден', id: 'неверный id анкеты', root: 'неверный рабочий каталог',
  request: 'неверный файловый запрос', io: 'не удалось прочитать или сохранить файл',
}
export function fileResponse(stdout: string): Record<string, unknown> {
  let value: unknown
  try { value = JSON.parse(stdout) } catch { throw new SurveyError(REASON.io) }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SurveyError(REASON.io)
  const response = value as Record<string, unknown>
  if (response.error !== undefined) throw new SurveyError(typeof response.error === 'string' ? REASON[response.error] ?? REASON.io : REASON.io)
  return response
}
export function fileEntries(response: Record<string, unknown>): Entry[] {
  if (!Array.isArray(response.entries)) throw new SurveyError(REASON.io)
  return response.entries.flatMap(item => {
    if (!item || typeof item !== 'object' || !validId(item.id) || typeof item.mtimeMs !== 'number' || !Number.isFinite(item.mtimeMs) || typeof item.isLink !== 'boolean') return []
    return [{ id: item.id as string, mtimeMs: item.mtimeMs as number, isLink: item.isLink as boolean }]
  }).sort((a, b) => b.mtimeMs - a.mtimeMs || a.id.localeCompare(b.id))
}
export function readResponse(response: Record<string, unknown>, optional = false): string | null {
  if (typeof response.text === 'string') return response.text
  if (optional && response.text === null) return null
  throw new SurveyError(REASON.io)
}
export function verifySaved(response: Record<string, unknown>): void {
  if (response.saved !== true) throw new SurveyError(REASON.io)
}
