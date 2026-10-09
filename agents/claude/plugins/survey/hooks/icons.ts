// Пары nerd/plain, кодовые точки и chevron — механизм FileTree/hooks/icons.ts.
const cp = (n: number) => String.fromCodePoint(n)
export const ICON = {
  survey: { nerd: '\u{f014d}', plain: '▤' }, // md-clipboard_text
  open: { nerd: cp(0xf035d), plain: '▾' }, // md-menu_down
  closed: { nerd: cp(0xf035f), plain: '▸' }, // md-menu_right
  pending: { nerd: cp(0xf0130), plain: '○' }, // md-checkbox_blank_circle_outline
  done: { nerd: cp(0xf05e0), plain: '✓' }, // md-check_circle
  radio: { nerd: cp(0xf043e), plain: '●' }, // md-radiobox_marked
  radioEmpty: { nerd: cp(0xf0130), plain: '○' }, // md-checkbox_blank_circle_outline
  check: { nerd: cp(0xf0132), plain: '☑' }, // md-checkbox_marked
  checkEmpty: { nerd: cp(0xf0131), plain: '☐' }, // md-checkbox_blank_outline
  recommended: { nerd: cp(0xf04ce), plain: '★' }, // md-star
  text: { nerd: cp(0xf03eb), plain: '›' }, // md-pencil
  send: { nerd: cp(0xf048a), plain: '↑' }, // md-send
  reset: { nerd: cp(0xf0450), plain: '↻' }, // md-refresh
  close: { nerd: cp(0xf0159), plain: '×' }, // md-close_circle
} as const
export type Glyphs = 'auto' | 'nerd' | 'plain'
export function glyph(name: keyof typeof ICON, setting: Glyphs, surface: string): string {
  return setting === 'plain' || (setting === 'auto' && surface !== 'terminal') ? ICON[name].plain : ICON[name].nerd
}
