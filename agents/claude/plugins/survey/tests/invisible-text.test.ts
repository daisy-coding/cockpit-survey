import { expect, test } from 'claude-code/testing'
import { clean, emptyAnswers, enterText, parseAnswers, parseSurvey, serialize } from '../hooks/survey'

// Коды записаны числами: в исходнике теста нет ни одного невидимого знака.
// Метки языка, монгольский разделитель, арабские форматирующие знаки, связки, половины суррогатной пары, акцент.
const HIDDEN = [0xe0001, 0xe0041, 0xe007f, 0x180e, 0x600, 0x601, 0x602, 0x603, 0x604, 0x605, 0x61c, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0xd800, 0xdfff, 0x301]
const at = (...codes: number[]) => String.fromCodePoint(...codes)
const NOW = '2026-10-08T00:00:00.000Z'
const spec = (value: string) => ({ version: 1, title: value, intro: value, questions: [
  { id: 'choice', title: value, detail: value, kind: 'single', options: [{ id: 'one', label: value, detail: value }] },
  { id: 'notes', title: 'Заметка', kind: 'text' },
] })
function saved(value: string): string {
  const survey = parseSurvey(JSON.stringify(spec('Вопрос')))
  const answers = enterText(survey, emptyAnswers('arch', survey, NOW), 1, value)
  const file = JSON.parse(serialize(parseAnswers(serialize(answers, NOW), 'arch', survey), NOW)) as { answers: { questionId: string; text?: string }[] }
  return file.answers.find(answer => answer.questionId === 'notes')?.text ?? ''
}

for (const code of HIDDEN) test(`TEXT-1 текст анкеты: U+${code.toString(16)} не доходит до экрана и файла ответов`, () => {
  const value = 'во-' + at(code) + 'прос'
  expect(clean(value)).toBe('во-прос')
  const survey = parseSurvey(JSON.stringify(spec(value)))
  expect([survey.title, survey.intro, survey.questions[0]!.title, survey.questions[0]!.detail, survey.questions[0]!.options[0]!.label, survey.questions[0]!.options[0]!.detail])
    .toEqual(Array.from({ length: 6 }, () => 'во-прос'))
  expect(saved(value)).toBe('во-прос')
})

test('TEXT-2 видимое остаётся: составная буква, связка эмодзи; последовательность терминала снимается целиком', () => {
  expect(clean('отче' + at(0x308) + 'т')).toBe('отчёт')
  const family = at(0x1f468, 0x200d, 0x1f469)
  expect(clean(family)).toBe(family)
  expect(clean('a' + at(27) + '[31mb')).toBe('ab')
  expect(clean('a' + at(10) + 'b')).toBe('a b')
})

// Решение при сверке задачи 183: секреты в тексте анкеты не ищутся. Ответ владельца,
// похожий на ключ или пароль, доходит до агента таким, каким введён.
test('TEXT-3 ответ владельца, похожий на секрет, сохраняется без замены', () => {
  for (const value of ['пример: password: qwerty12345', 'каталог ' + 'sk' + '-learn-tutorial-notebook-final']) expect(saved(value)).toBe(value)
})
