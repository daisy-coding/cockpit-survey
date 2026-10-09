import { DEFAULT_THEME, roleColors } from '../hooks/theme'
import { expect, test } from 'claude-code/testing'
import { emptyAnswers, parseSurvey } from '../hooks/survey'
import { initialView, surveyRows, visibleProps } from '../hooks/view'
import { SPEC } from './fixtures'
for (const width of [40, 80, 120]) test(`Тема FileTree и правая свободная колонка: ${width}`, () => {
  const survey = parseSurvey(JSON.stringify(SPEC)), view = initialView(survey)
  view.limit = 2
  const rows = surveyRows(survey, emptyAnswers('arch', survey, ''), view, width, 'plain', 'terminal')
  for (const row of rows) expect(row.right.map(seg => seg.t).join('')).toMatch(/  $/)
  const props = visibleProps(rows, view)
  expect(props.activeBg).toBe(roleColors(DEFAULT_THEME).fill); expect(props.hoverBg).toBe(roleColors(DEFAULT_THEME).fill)
  expect(props.bar?.thumb).toBe(DEFAULT_THEME.accent)
})
