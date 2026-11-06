import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './ui.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const blank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

// Pergunta condicional: só aparece depois que a pergunta de origem recebe uma resposta que satisfaz a condição.
export const isVisible = (q, ctx) => {
  const c = q.showIf
  if (!c) return true
  const v = ctx[c.q]
  if (v === undefined || v === null) return false
  if (c.in) return c.in.includes(v)
  if (c.notIn) return !c.notIn.includes(v)
  return true
}

// Prévia do CCEB (o servidor recalcula e é a fonte oficial)
function cceb(inst, a) {
  const sums = { bens: 0, instrucao: 0, servicos: 0 }
  let complete = true
  for (const q of inst.sections.flatMap((s) => s.questions).filter((q) => q.group)) {
    const o = q.options.find((o) => o.v === a[q.id])
    if (!o) { complete = false; continue }
    sums[q.group] += o.points
  }
  const total = sums.bens + sums.instrucao + sums.servicos
  return { ...sums, total, complete, cut: inst.cutoffs.find((c) => total >= c.min && total <= c.max) }
}

export default function Form({ inst, ctx, initial, updatedAt, draftKey, onSave, saving }) {
  const questions = useMemo(() => inst.sections.flatMap((s) => s.questions), [inst])
  const own = useMemo(() => new Set(questions.map((q) => q.id)), [questions])

  // Rascunho local: se houver alterações não enviadas mais novas que o servidor, recupera.
  const init = useMemo(() => {
    let answers = { ...(initial || {}) }
    let restored = false
    try {
      const raw = draftKey && localStorage.getItem(draftKey)
      if (raw) {
        const s = JSON.parse(raw)
        if (!updatedAt || s.savedAt > new Date(updatedAt).getTime()) { answers = s.answers; restored = true }
        else localStorage.removeItem(draftKey)
      }
    } catch { /* ignora */ }
    for (const q of questions) if (q.default === 'today' && !answers[q.id]) answers[q.id] = today()
    return { answers, restored }
  }, []) // eslint-disable-line
  const [a, setA] = useState(init.answers)
  const [restored, setRestored] = useState(init.restored)
  const [missing, setMissing] = useState([])
  const [blockMsg, setBlockMsg] = useState('')
  const dirty = useRef(init.restored)
  const all = { ...ctx, ...a }

  const set = (id, v) => { dirty.current = true; setA((p) => ({ ...p, [id]: v })); setMissing((m) => m.filter((x) => x !== id)) }

  // Salva automaticamente no navegador a cada alteração (evita perder dados ao trocar de bloco)
  useEffect(() => {
    if (!dirty.current || !draftKey) return
    try { localStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), answers: a })) } catch { /* cheio */ }
  }, [a, draftKey])
  useEffect(() => {
    const warn = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = '' } }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [])

  const discardLocal = () => {
    try { localStorage.removeItem(draftKey) } catch { /* ignora */ }
    const fresh = { ...(initial || {}) }
    for (const q of questions) if (q.default === 'today' && !fresh[q.id]) fresh[q.id] = today()
    setA(fresh); setRestored(false); dirty.current = false
  }

  // Perguntas que dependem de resposta em OUTRO instrumento (ex.: Q22/Q23 dependem do sexo, Instrumento 1)
  const crossPending = questions.filter((q) => q.showIf && !own.has(q.showIf.q) && all[q.showIf.q] == null)
  const needs = [...new Set(crossPending.map((q) => q.showIf.needs || q.showIf.q))]

  const required = questions.filter((q) => isVisible(q, all) && !q.optional)
  const answered = required.filter((q) => !blank(a[q.id])).length
  const pct = required.length ? Math.round((answered / required.length) * 100) : 0

  const submit = async (status) => {
    setBlockMsg('')
    if (status === 'complete') {
      if (needs.length) { setBlockMsg(`Para finalizar, informe antes: ${needs.join('; ')}.`); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      const miss = required.filter((q) => blank(a[q.id])).map((q) => q.id)
      setMissing(miss)
      if (miss.length) { document.getElementById('q-' + miss[0])?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    }
    const out = {}
    for (const q of questions) if (isVisible(q, all) && !blank(a[q.id])) out[q.id] = a[q.id]
    const ok = await onSave(status, out)
    if (ok) { try { localStorage.removeItem(draftKey) } catch { /* ignora */ } dirty.current = false }
  }

  const altDif = inst.id === 'i2' && a.q25_altura1_cm && a.q26_altura2_cm ? Math.abs(a.q25_altura1_cm - a.q26_altura2_cm) : null
  const c6 = inst.id === 'i6' ? cceb(inst, a) : null

  return (
    <div className="form">
      <div className="progresshead card">
        <div className="row"><b>Progresso</b><span>{answered} de {required.length} · {pct}%</span></div>
        <div className="bar big"><i style={{ width: pct + '%' }} /></div>
      </div>
      <div className="note">{inst.instruction}</div>
      {inst.who && <div className="note info"><b>Quem preenche:</b> {inst.who}</div>}
      {restored && (
        <div className="note warn">Recuperamos um rascunho não enviado deste formulário (salvo neste navegador). Revise e salve.{' '}
          <button type="button" className="link" onClick={discardLocal}>Descartar e começar do último salvo</button></div>
      )}
      {needs.length > 0 && <div className="note info">As perguntas 22 e 23 são só para meninas e dependem de: {needs.join('; ')}. Elas aparecem quando esse dado estiver registrado.</div>}
      {blockMsg && <div className="note warn"><b>{blockMsg}</b></div>}

      {inst.sections.map((s) => {
        const qs = s.questions.filter((q) => isVisible(q, all))
        if (!qs.length) return null
        return (
          <section key={s.title} className="card">
            <h3><span className="step" />{s.title}</h3>
            {s.intro && <p className="intro">{s.intro}</p>}
            {qs.map((q) => (
              <div key={q.id} id={'q-' + q.id} className={'q' + (missing.includes(q.id) ? ' missing' : '')}>
                {q.intro && <div className="qintro">{q.intro}</div>}
                <div className="qlabel">
                  {q.num && <b className="qnum">{q.num}</b>}{q.label}
                  {q.who && <span className="who">{q.who}</span>}
                  {q.ref && <span className="ref">{q.ref}</span>}
                </div>
                {q.hint && <div className="hint">{q.hint}</div>}
                <Field q={q} value={a[q.id]} onChange={(v) => set(q.id, v)} />
                {missing.includes(q.id) && <div className="err">Resposta obrigatória</div>}
              </div>
            ))}
          </section>
        )
      })}

      {altDif !== null && altDif > 0.5 && (
        <div className="note warn">Diferença entre as duas alturas: <b>{altDif.toFixed(1).replace('.', ',')} cm</b> (máximo admitido: 0,5 cm). Refaça a aferição.</div>
      )}

      {c6 && (
        <section className="card result">
          <h3>Resultado (prévia)</h3>
          <div className="kpis">
            <div><span>Bens</span><b>{c6.bens}</b></div>
            <div><span>Instrução</span><b>{c6.instrucao}</b></div>
            <div><span>Serviços</span><b>{c6.servicos}</b></div>
            <div><span>Escore total</span><b>{c6.total}</b></div>
            <div><span>Classe</span><b>{c6.complete && c6.cut ? c6.cut.class : '—'}</b></div>
            <div><span>Renda média</span><b>{c6.complete && c6.cut ? brl(c6.cut.income) : '—'}</b></div>
          </div>
        </section>
      )}

      <div className="actionbar">
        <button className="btn ghost" disabled={saving} onClick={() => submit('draft')}>Salvar rascunho</button>
        <button className="btn" disabled={saving} onClick={() => submit('complete')}><Icon name="check" size={16} />{saving ? 'Salvando…' : 'Finalizar e salvar'}</button>
      </div>
    </div>
  )
}

// Peso e altura: só aceita dígitos e vírgula (ponto é bloqueado). Altura aceita cm (163,5) ou metros (1,63).
function NumField({ q, value, onChange }) {
  const isH = q.input === 'height'
  const unit = isH ? 'cm' : q.unit
  const [text, setText] = useState(() => (value == null ? '' : String(value).replace('.', ',')))
  const [err, setErr] = useState('')
  const [dot, setDot] = useState(false)

  const parse = (raw) => {
    const s = raw.toLowerCase().replace(isH ? /(cm|m)$/ : /(kg|g)$/, '')
    if (!/^\d+(,\d{1,2})?$/.test(s)) return NaN
    let v = Number(s.replace(',', '.'))
    if (isH && v > 0 && v < 3) v *= 100          // 1,63 → 163 cm
    return Math.round(v * 100) / 100
  }
  const change = (e) => {
    setDot(e.target.value.includes('.'))
    const t = e.target.value.replace(/[^0-9,a-zA-Z]/g, '')   // remove ponto, espaços e símbolos
    setText(t)
    if (!t) { setErr(''); onChange(undefined); return }
    const v = parse(t)
    if (Number.isNaN(v)) { setErr('Formato inválido. Use vírgula, por exemplo ' + (isH ? '163,5 ou 1,63' : '58,4') + '.'); onChange(undefined); return }
    if (v < q.min || v > q.max) { setErr(`Valor fora da faixa (${String(q.min).replace('.', ',')} a ${String(q.max).replace('.', ',')} ${unit}).`); onChange(undefined); return }
    setErr(''); onChange(v)
  }
  const interpreted = value != null && !err && text && String(value).replace('.', ',') !== text.replace(/[a-z]/gi, '')
  return (
    <div>
      <div className="numrow">
        <input className="inp" inputMode="decimal" autoComplete="off" placeholder={isH ? 'ex.: 163,5' : 'ex.: 58,4'} value={text}
          onKeyDown={(e) => { if (e.key === '.') { e.preventDefault(); setDot(true) } }} onChange={change} />
        <span>{unit}</span>
      </div>
      {interpreted && <div className="hint">Será registrado como <b>{String(value).replace('.', ',')} {unit}</b></div>}
      {dot && <div className="err">Use vírgula (,) para os decimais. O ponto não é aceito.</div>}
      {err && <div className="err">{err}</div>}
    </div>
  )
}

function Field({ q, value, onChange }) {
  switch (q.type) {
    case 'date':
      return <input className="inp" type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return <NumField q={q} value={value} onChange={onChange} />
    case 'single':
      return (
        <div className={'opts' + (q.layout === 'inline' ? ' inline' : '')}>
          {q.options.map((o) => (
            <label key={o.v} className={'opt' + (value === o.v ? ' on' : '')}>
              <input type="radio" name={q.id} checked={value === o.v} onChange={() => onChange(o.v)} /><span>{o.l}</span>
            </label>
          ))}
        </div>
      )
    case 'multi': {
      const sel = value || []
      return (
        <div className="opts">
          {q.options.map((o) => (
            <label key={o.v} className={'opt' + (sel.includes(o.v) ? ' on' : '')}>
              <input type="checkbox" checked={sel.includes(o.v)} onChange={() => onChange(sel.includes(o.v) ? sel.filter((x) => x !== o.v) : [...sel, o.v])} /><span>{o.l}</span>
            </label>
          ))}
        </div>
      )
    }
    case 'meds': {
      const rows = value?.length ? value : [{}]
      const upd = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
      return (
        <div className="meds">
          {rows.map((r, i) => (
            <div key={i} className="medrow">
              <input className="inp" placeholder="Medicamento / indicação" value={r.nome || ''} onChange={(e) => upd(i, 'nome', e.target.value)} />
              <input className="inp" placeholder="Horário(s)" value={r.horario || ''} onChange={(e) => upd(i, 'horario', e.target.value)} />
              <input className="inp" placeholder="Dose" value={r.dose || ''} onChange={(e) => upd(i, 'dose', e.target.value)} />
              <select className="inp" value={r.prescricao || ''} onChange={(e) => upd(i, 'prescricao', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">Prescrição?</option><option value="1">Sim</option><option value="2">Não</option>
              </select>
              <button type="button" className="iconbtn danger" title="Remover" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
            </div>
          ))}
          {rows.length < 5 && <button type="button" className="btn ghost sm" onClick={() => onChange([...rows, {}])}><Icon name="plus" size={14} />Medicamento</button>}
        </div>
      )
    }
    default:
      return <input className="inp" value={value || ''} onChange={(e) => onChange(e.target.value)} />
  }
}
