import { expect, test } from 'claude-code/testing'
import { command, host, PANE, SPEC } from './fixtures'
import { panelText } from './panel-fixture'

for (const surface of ['terminal', 'desktop'] as const) test(`Write без session.start открывает анкету: ${surface}`, async ($, on) => {
  const fixture = host(on, null)
  await $.tool.call({ tool: 'Write', file_path: fixture.path('arch'), content: JSON.stringify(SPEC) })
  expect(fixture.events).toEqual(['write', 'open'])
  const pane = await $.ui.mount({ plugin: 'survey', surface, component: 'Pane', requestId: 'survey', props: PANE })
  expect(await panelText(pane)).toContain(SPEC.title)
  await pane.unmount()
})

test('Первый запрос после поздней загрузки обнаруживает файл без события Write', async ($, on) => {
  const fixture = host(on, null)
  fixture.files.set(fixture.path('arch'), JSON.stringify(SPEC))
  const context = ['Прежний контекст']
  await $.prompt.submit({ text: 'Продолжай', context, origin: { kind: 'composer' }, wait: false })
  expect(fixture.opens).toHaveLength(1)
  expect(fixture.prompts[0]?.context).toEqual(context)
  expect(fixture.answers()).toBeUndefined()
  await $.prompt.submit({ text: 'Ещё запрос', origin: { kind: 'composer' }, wait: false })
  expect(fixture.opens).toHaveLength(1)
  await $.command.run(command('answer notes Ответ'))
  expect(fixture.answers()?.answers[2]?.text).toBe('Ответ')
})

test('Запрос восстанавливает только незавершённую анкету; render не пишет ответы', async ($, on) => {
  const fixture = host(on)
  await $.command.run(command())
  await $.command.run(command('answer notes Ответ'))
  const pane = await $.ui.mount({ plugin: 'survey', surface: 'terminal', component: 'Pane', requestId: 'survey', props: PANE })
  await pane.press({ key: 'send' }); await pane.press({ key: 'send' })
  const before = fixture.requests.filter(item => item.op === 'write').length
  fixture.sessionId = 'late-session'
  await $.prompt.submit({ text: 'Продолжай', origin: { kind: 'bridge' }, wait: false })
  expect(fixture.opens).toHaveLength(1)
  await pane.redraw()
  expect(fixture.requests.filter(item => item.op === 'write')).toHaveLength(before)
  await pane.unmount()
})
