import { useEffect, useState } from 'react'
import { api } from './api.js'
import { go } from './router.js'
import Form from './Form.jsx'
import { Icon, Avatar, Badge, Progress, toast, theme, grad } from './ui.jsx'

export function Roster({ inst, moment, schema }) {
  const def = schema.find((i) => i.id === inst)
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')
  useEffect(() => { api.participants().then(setRows) }, [inst, moment])
  if (!def) return <p>Instrumento não encontrado.</p>
  const t = theme(inst, moment)
  const st = (r) => r.responses.find((x) => x.instrument === inst && x.moment === moment)?.status || 'none'
  const all = rows || []
  const count = (s) => all.filter((r) => st(r) === s).length
  const pct = all.length ? Math.round((count('complete') / all.length) * 100) : 0
  const list = all.filter((r) => (tab === 'all' || st(r) === tab) && (!q || (r.fullName + r.code).toLowerCase().includes(q.toLowerCase())))
  const tabs = [['all', 'Todos', all.length], ['none', 'Pendentes', count('none')], ['draft', 'Rascunhos', count('draft')], ['complete', 'Completos', count('complete')]]

  return (
    <>
      <section className="rosterhead" style={{ background: grad(t) }}>
        <div><span className="itag glass"><Icon name={t.icon} size={15} />{t.tag}</span><h2>{def.title}</h2><p>{def.instruction}</p></div>
        <div className="rprog"><b>{pct}%</b><span>{count('complete')} de {all.length} completos</span><Progress value={pct} color="#fff" /></div>
      </section>
      <div className="toolbar">
        <div className="tabs">{tabs.map(([k, l, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} <em>{n}</em></button>)}</div>
        <div className="field"><Icon name="search" size={16} /><input placeholder="Buscar aluno…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="card tablecard">
        {list.map((r) => (
          <div key={r.id} className="rosterrow" onClick={() => go(`/q/${inst}/${moment}/${r.id}`)}>
            <Avatar name={r.fullName} />
            <div className="grow"><b>{r.fullName}</b><small>{r.code} · {r.school} · {r.gradeClass}</small></div>
            <Badge status={st(r) === 'none' ? null : st(r)} />
            <span className="btn sm">{st(r) === 'none' ? 'Responder' : st(r) === 'draft' ? 'Continuar' : 'Revisar'}</span>
          </div>
        ))}
        {rows && list.length === 0 && <p className="muted pad">Nenhum aluno nesta lista.</p>}
      </div>
    </>
  )
}

export function Fill({ inst, moment, pid, schema }) {
  const [p, setP] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api.participant(pid).then(setP).catch(() => setP(false)) }, [pid])
  const def = schema.find((i) => i.id === inst)
  if (p === false || !def) return <p>Não encontrado.</p>
  if (!p) return <p className="muted">Carregando…</p>
  const t = theme(inst, moment)
  const own = p.responses.find((r) => r.instrument === inst && r.moment === moment)
  const ctx = Object.assign({}, ...p.responses.filter((r) => r.instrument !== inst).map((r) => r.data))
  const onSave = async (status, data) => {
    setSaving(true); setErr('')
    try {
      await api.saveResponse(pid, inst, moment, status, data)
      toast(status === 'complete' ? 'Questionário finalizado' : 'Rascunho salvo')
      go(`/q/${inst}/${moment}`)
    } catch (x) { setErr(x.message); setSaving(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  }
  return (
    <>
      <a className="back" href={`#/q/${inst}/${moment}`}><Icon name="left" size={16} />{t.short}</a>
      <section className="fillhead">
        <Avatar name={p.fullName} size={52} />
        <div className="grow"><h2>{p.fullName}</h2><p className="muted">ID {p.code} · {p.school} · {p.gradeClass}</p></div>
        <span className="itag" style={{ background: grad(t) }}><Icon name={t.icon} size={15} />{t.tag}</span>
      </section>
      <h3 className="ftitle">{def.title}</h3>
      {err && <div className="note warn">{err}</div>}
      <Form inst={def} ctx={ctx} initial={own?.data} onSave={onSave} saving={saving} />
    </>
  )
}
