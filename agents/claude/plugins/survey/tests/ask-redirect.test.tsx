import { expect, test } from 'claude-code/testing'
import { host } from './fixtures'

const ASK = {
  tool: 'AskUserQuestion' as const,
  questions: [{ question: 'Где хранить данные?', header: 'Хранилище', multiSelect: false,
    options: [{ label: 'SQLite', description: 'Локальный файл' }, { label: 'PostgreSQL', description: 'Отдельный сервер' }] }],
}

test('DEGRADED-136: без Python штатный вопрос и системная подсказка остаются доступны', async ($, on) => {
  const fixture = host(on)
  fixture.brokenProcess = true
  let ran = false
  on('tool.call', () => { ran = true; return { deny: 'штатный опрос' } })
  on('prompt.compose', () => ({ sections: [] }))
  expect((await $.tool.call(ASK)).deny).toBe('штатный опрос')
  expect(ran).toBe(true)
  const result = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5',
    surfaces: ['terminal'], outputStyle: null, tools: ['AskUserQuestion'], traits: [] })
  expect(result.sections).toEqual([])
  fixture.brokenProcess = false
  ran = false
  expect((await $.tool.call(ASK)).deny).toContain('survey-authoring')
  expect(ran).toBe(false)
})

test('Штатный вопрос AskUserQuestion не исполняется и направляет агента на анкету', async ($, on) => {
  host(on)
  let ran = false
  on('tool.call', () => { ran = true; return { deny: 'штатный опрос' } })
  const result = await $.tool.call(ASK)
  expect(ran).toBe(false)
  expect(result.deny).toContain('.cockpit/surveys/')
  expect(result.deny).toContain('survey-authoring')
  expect(result.deny).toContain('Write')
  expect(result.deny).toBe('Опрос отклонён: нужна анкета. Write .cockpit/surveys/<id>.json; survey-authoring')
  expect(result.deny!.length).toBeLessThanOrEqual(80)
})

test('Системная подсказка заранее говорит задавать вопросы анкетой; в print и bare — нет', async ($, on) => {
  host(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  const compose = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], outputStyle: null } as const
  const tools = ['Bash', 'Write', 'AskUserQuestion']
  const interactive = await $.prompt.compose({ ...compose, tools, traits: [] })
  expect(interactive.sections.at(-1)).toMatchObject({ id: 'survey:questions', scope: 'session' })
  expect(interactive.sections.at(-1)?.text).toContain('.cockpit/surveys/')
  expect((await $.prompt.compose({ ...compose, tools, traits: ['print'] })).sections.map(section => section.id)).toEqual(['intro'])
  expect((await $.prompt.compose({ ...compose, tools, traits: ['bare'] })).sections.map(section => section.id)).toEqual(['intro'])
  expect((await $.prompt.compose({ ...compose, tools: ['Bash'], traits: [] })).sections.map(section => section.id)).toEqual(['intro'])
})
