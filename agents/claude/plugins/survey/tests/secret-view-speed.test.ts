import { expect, test } from 'claude-code/testing'
import { clean, emptyAnswers, enterText, parseSurvey } from '../hooks/survey'
const survey = parseSurvey(JSON.stringify({ version: 1, title: 'Вопрос', questions: [{ id: 'notes', title: 'Ответ', kind: 'text' }] }))
const answers = emptyAnswers('arch', survey, '2026-10-08T00:00:00Z')
const surfaces = [
  ['clean', (text: string) => clean(text)],
  ['input', (text: string) => enterText(survey, answers, 0, text)],
] as const

const N = 256 * 1024
const hidden = ['\u{e0001}', '\u{e0041}', '\u{e007f}', '\u180e', '\u0600', '\u0601', '\u0602', '\u0603', '\u0604', '\u0605', '\u061c', '\u200b', '\u200c', '\u200d', '\u2060', '\ud800', '\udfff', '\u0301']
const rep = (unit: string) => unit.repeat(Math.floor(N / unit.length))
const cases = [
  ...hidden.map((char, index) => ['hidden ' + index, rep(char)] as const),
  ['hidden words', rep('a\u{e0041}')], ['hidden keys', rep('sk-\u180e')],
  ['jwt tags', rep('eyJ_-\u{e0001}')], ['jwt segments', rep('eyJaaaaaaaa.\u180ebbbbbbbb.')],
  ['ansi', rep('\u001b[31m')], ['hidden alternating', rep('a\u0301\u200c')],
] as const

// Как в github/tests/secret-view-speed.test.ts: повтор медленного замера и рост 4:1.
// Лучший из трёх снимает шум нагрузки; порог и ограничение роста остаются прежними.
for (const [name, show] of surfaces) for (let from = 0; from < cases.length; from += 4) {
  test('Скорость ' + name + ': скрытые входы ' + (from + 1) + '–' + (from + 4) + ', 256 КБ', () => {
    const slow: string[] = []
    for (const [label, text] of cases.slice(from, from + 4)) {
      const timed = (input: string) => { const at = Date.now(); show(input); return Date.now() - at }
      let ms = timed(text)
      if (ms <= 300) continue
      ms = Math.min(ms, timed(text), timed(text))
      if (ms <= 300) continue
      const part = text.slice(0, Math.floor(text.length / 4))
      const small = Math.min(timed(part), timed(part), timed(part))
      if (ms > 1500 || ms > small * 8) slow.push(name + ':' + label + '=' + small + '/' + ms)
    }
    expect(slow.join(' ')).toBe('')
  })
}
