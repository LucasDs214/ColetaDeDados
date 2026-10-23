import { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { go } from './router.js'
import { Icon, Avatar, Badge, toast, theme, grad, ago } from './ui.jsx'

const stOf = (rs, inst, m = 'M1') => rs.find((x) => x.instrument === inst && x.moment === m)?.status
const SLOTS = [['i1', 'M1', 'I1'], ['i2', 'M1', 'M1'], ['i2', 'M2', 'M2'], ['i2', 'M3', 'M3'], ['i6', 'M1', 'I6']]

export function People({ params }) {
  const [q, setQ] = useState(params.get('q') || '')
  const [school, setSchool] = useState('')
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => setQ(params.get('q') || ''), [params])
  useEffect(() => {
    const t = setTimeout(() => api.participants(q).then(setRows).catch((e) => setErr(e.message)), 200)
    return () => clearTimeout(t)
  }, [q])
  const schools = useMemo(() => [...new Set((rows || []).map((r) => r.school))], [rows])
  const list = (rows || []).filter((r) => !school || r.school === school)

  return (
    <>
      <div className="sectionhead"><h2>Participantes <span className="count">{list.length}</span></h2>
        <button className="btn" onClick={() => go('/participantes/novo')}><Icon name="plus" size={16} />Novo participante</button></div>
      <div className="toolbar">
        <div className="field"><Icon name="search" size={16} /><input placeholder="Buscar por nome ou ID…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="inp" value={school} onChange={(e) => setSchool(e.target.value)}>
          <option value="">Todas as unidades</option>{schools.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {err && <div className="note warn">{err}</div>}
      <div className="card tablecard">
        <table>
          <thead><tr><th>Aluno</th><th>Unidade · Turma</th><th>I1</th><th>Antrop. M1 · M2 · M3</th><th>CCEB</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} onClick={() => go('/participantes/' + r.id)}>
                <td><div className="person"><Avatar name={r.fullName} /><div><b>{r.fullName}</b><small>{r.code}</small></div></div></td>
                <td>{r.school}<small>{r.gradeClass}</small></td>
                <td><Pip s={stOf(r.responses, 'i1')} /></td>
                <td><span className="pips">{['M1', 'M2', 'M3'].map((m) => <Pip key={m} s={stOf(r.responses, 'i2', m)} />)}</span></td>
                <td><Pip s={stOf(r.responses, 'i6')} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && list.length === 0 && <p className="muted pad">Nenhum participante encontrado.</p>}
      </div>
    </>
  )
}

export const Pip = ({ s }) => <i className={'pip ' + (s || 'none')} title={s === 'complete' ? 'Completo' : s === 'draft' ? 'Rascunho' : 'Pendente'} />

export function Detail({ id, schema }) {
  const [p, setP] = useState(null)
  useEffect(() => { api.participant(id).then(setP).catch(() => setP(false)) }, [id])
  if (p === false) return <p>Participante não encontrado.</p>
  if (!p) return <p className="muted">Carregando…</p>
  const remove = async () => {
    if (!confirm(`Excluir ${p.fullName} e todas as respostas dele(a)? Esta ação não pode ser desfeita.`)) return
    await api.deleteParticipant(id); toast('Participante excluído'); go('/participantes')
  }
  const done = SLOTS.filter(([i, m]) => stOf(p.responses, i, m) === 'complete').length
  return (
    <>
      <a className="back" href="#/participantes"><Icon name="left" size={16} />Participantes</a>
      <section className="card profile">
        <Avatar name={p.fullName} size={64} />
        <div className="pinfo">
          <h2>{p.fullName}</h2>
          <p className="muted">ID <b>{p.code}</b> · {p.school}{p.gradeClass ? ' · ' + p.gradeClass : ''}</p>
          <p className="muted small">{p.birthDate ? 'Nascimento: ' + p.birthDate.split('-').reverse().join('/') : 'Nascimento não informado'}{p.email ? ' · ' + p.email : ''}</p>
        </div>
        <div className="pactions">
          <span className="chip light">{done} de {SLOTS.length} completos</span>
          <button className="btn ghost sm" onClick={() => go(`/participantes/${id}/editar`)}><Icon name="edit" size={14} />Editar</button>
          <button className="btn ghost sm danger" onClick={remove}><Icon name="trash" size={14} />Excluir</button>
        </div>
      </section>
      <div className="sectionhead"><h2>Questionários</h2></div>
      <div className="cards5">
        {SLOTS.map(([inst, m]) => {
          const t = theme(inst, m)
          const r = p.responses.find((x) => x.instrument === inst && x.moment === m)
          return (
            <a key={inst + m} className="icard card" href={`#/q/${inst}/${m}/${id}`}>
              <span className="itag" style={{ background: grad(t) }}><Icon name={t.icon} size={15} />{t.tag}</span>
              <h4>{t.name}</h4>
              <div className="imeta"><Badge status={r?.status} />{r && <span>{ago(r.updatedAt)}</span>}</div>
              <span className="btn sm cta">{r ? (r.status === 'complete' ? 'Revisar' : 'Continuar') : 'Responder'}</span>
            </a>
          )
        })}
      </div>
    </>
  )
}

export function Editor({ id }) {
  const [f, setF] = useState({ code: '', school: '', fullName: '', birthDate: '', email: '', gradeClass: '' })
  const [err, setErr] = useState('')
  useEffect(() => {
    if (id) api.participant(id).then((p) => setF({ code: p.code, school: p.school, fullName: p.fullName, birthDate: p.birthDate || '', email: p.email || '', gradeClass: p.gradeClass || '' }))
  }, [id])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault(); setErr('')
    try {
      const r = id ? await api.updateParticipant(id, f) : await api.createParticipant(f)
      toast(id ? 'Dados atualizados' : 'Participante cadastrado'); go('/participantes/' + r.id)
    } catch (x) { setErr(x.message) }
  }
  return (
    <>
      <a className="back" href={id ? '#/participantes/' + id : '#/participantes'}><Icon name="left" size={16} />Voltar</a>
      <form className="card formcard" onSubmit={save}>
        <h2>{id ? 'Editar participante' : 'Novo participante'}</h2>
        <div className="grid2">
          <label>ID do participante *<input className="inp" value={f.code} onChange={set('code')} required /></label>
          <label>Unidade escolar (FAETEC) *<input className="inp" value={f.school} onChange={set('school')} required /></label>
          <label className="span2">Nome completo *<input className="inp" value={f.fullName} onChange={set('fullName')} required /></label>
          <label>Data de nascimento<input className="inp" type="date" value={f.birthDate} onChange={set('birthDate')} /></label>
          <label>Série / Turma<input className="inp" value={f.gradeClass} onChange={set('gradeClass')} /></label>
          <label className="span2">E-mail<input className="inp" type="email" value={f.email} onChange={set('email')} /></label>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="actions"><button type="button" className="btn ghost" onClick={() => history.back()}>Cancelar</button><button className="btn">Salvar</button></div>
      </form>
    </>
  )
}
