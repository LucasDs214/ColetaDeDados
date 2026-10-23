import { useEffect, useState } from 'react'

const P = {
  home: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M21 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  clipboard: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 3h6v4H9z M9 12h6 M9 16h4',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  plus: 'M12 5v14 M5 12h14',
  check: 'M20 6L9 17l-5-5',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  ruler: 'M21.3 8.7L8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4z M7.5 10.5l2 2 M10.5 7.5l2 2 M13.5 4.5l2 2 M4.5 13.5l2 2',
  coins: 'M12 20V10 M18 20V4 M6 20v-4',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8',
  layers: 'M12 2l10 5-10 5L2 7z M2 17l10 5 10-5 M2 12l10 5 10-5',
  flask: 'M9 3h6 M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3',
}
export const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {P[name].split(' M').map((d, i) => <path key={i} d={(i ? 'M' : '') + d} />)}
  </svg>
)

// Identidade visual por instrumento / momento (cores inspiradas no layout de referência)
const THEMES = {
  'i1-M1': { a: '#1e5bd8', b: '#3b82f6', icon: 'clipboard', tag: 'Instrumento 1', name: 'Sociodemográfico e Atividade Física', short: 'Sociodemográfico' },
  'i2-M1': { a: '#0f766e', b: '#14b8a6', icon: 'ruler', tag: 'Instrumento 2 · M1', name: 'Antropometria — março', short: 'Antropometria · M1 (março)' },
  'i2-M2': { a: '#0369a1', b: '#38bdf8', icon: 'ruler', tag: 'Instrumento 2 · M2', name: 'Antropometria — agosto', short: 'Antropometria · M2 (agosto)' },
  'i2-M3': { a: '#4338ca', b: '#6366f1', icon: 'ruler', tag: 'Instrumento 2 · M3', name: 'Antropometria — novembro', short: 'Antropometria · M3 (novembro)' },
  'i6-M1': { a: '#b45309', b: '#f59e0b', icon: 'coins', tag: 'Instrumento 6', name: 'Nível Socioeconômico (CCEB 2026)', short: 'CCEB 2026' },
}
export const theme = (inst, moment) => THEMES[`${inst}-${moment}`] || THEMES['i1-M1']
export const grad = (t) => `linear-gradient(120deg, ${t.a}, ${t.b})`

const COLORS = ['#1d5fd1', '#0e7490', '#0f766e', '#4338ca', '#475569', '#b45309', '#1e40af']
export const initials = (n) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
export function Avatar({ name, size = 38 }) {
  const c = COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % COLORS.length]
  return <span className="avatar" style={{ width: size, height: size, background: c, fontSize: size * 0.38 }}>{initials(name)}</span>
}

export const Progress = ({ value, color = 'var(--brand)' }) => (
  <span className="bar"><i style={{ width: `${Math.min(100, value)}%`, background: color }} /></span>
)

const ST = { complete: ['Completo', 'ok'], draft: ['Rascunho', 'warn'], none: ['Pendente', 'idle'] }
export const Badge = ({ status }) => {
  const [l, c] = ST[status || 'none']
  return <span className={'badge ' + c}>{l}</span>
}

export const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  if (s < 60) return 'agora há pouco'
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour')
  return rtf.format(-Math.round(s / 86400), 'day')
}

// Toast simples
export const toast = (msg, kind = 'ok') => window.dispatchEvent(new CustomEvent('toast', { detail: { msg, kind } }))
export function Toasts() {
  const [t, setT] = useState(null)
  useEffect(() => {
    let h
    const f = (e) => { setT(e.detail); clearTimeout(h); h = setTimeout(() => setT(null), 3200) }
    addEventListener('toast', f)
    return () => removeEventListener('toast', f)
  }, [])
  return t ? <div className={'toast ' + t.kind}>{t.kind === 'ok' && <Icon name="check" size={16} />} {t.msg}</div> : null
}
