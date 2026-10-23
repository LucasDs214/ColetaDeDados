import { useMemo, useState } from 'react'
import { Icon } from './ui.jsx'

const today = () => new Date().toISOString().slice(0, 10)
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Condição sobre pergunta do MESMO instrumento: "in" só aparece após responder.
// Sobre outro instrumento (ex.: sexo): aparece enquanto não informado.
export const isVisible = (q, ctx, own) => {
  const c = q.showIf
  if (!c) return true
  const v = ctx[c.q]
  if (v === undefined || v === null) return own.has(c.q) ? !c.in : true
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

const blank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export default function Form({ inst, ctx, initial, onSave, saving }) {
  const questions = useMemo(() => inst.sections.flatMap((s) => s.questions), [inst])
  const own = useMemo(() => new Set(questions.map((q) => q.id)), [questions])
  const [a, setA] = useState(() => {
    const d = { ...(initial || {}) }
    for (const q of questions) if (q.default === 'today' && !d[q.id]) d[q.id] = today()
    return d
  })
  const [missing, setMissing] = useState([])
  const all = { ...ctx, ...a }
  const set = (id, v) => { setA((p) => ({ ...p, [id]: v })); setMissing((m) => m.filter((x) => x !== id)) }

  // Pergunta condicionada a outro instrumento ainda não respondido (ex.: Q22/Q23 sem sexo): não é obrigatória
  const crossUnknown = (q) => q.showIf && !own.has(q.showIf.q) && all[q.showIf.q] == null
  const required = questions.filter((q) => isVisible(q, all, own) && !q.optional && !crossUnknown(q))
  const answered = required.filter((q) => !blank(a[q.id])).length
  const pct = required.length ? Math.round((answered / required.length) * 100) : 0

  const submit = (status) => {
    if (status === 'complete') {
      const miss = required.filter((q) => blank(a[q.id])).map((q) => q.id)
      setMissing(miss)
      if (miss.length) { document.getElementById('q-' + miss[0])?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    }
    const out = {}
    for (const q of questions) if (isVisible(q, all, own) && !blank(a[q.id])) out[q.id] = a[q.id]
    onSave(status, out)
  }

  const altDif = inst.id === 'i2' && a.q25_altura1_cm && a.q26_altura2_cm ? Math.abs(a.q25_altura1_cm - a.q26_altura2_cm) : null
  const c6 = inst.id === 'i6' ? cceb(inst, a) : null
  const sexUnknown = questions.some(crossUnknown)

  return (
    <div className="form">
      <div className="progresshead card">
        <div className="row"><b>Progresso</b><span>{answered} de {required.length} · {pct}%</span></div>
        <div className="bar big"><i style={{ width: pct + '%' }} /></div>
      </div>
      <div className="note">{inst.instruction}</div>
      {sexUnknown && <div className="note info">O sexo ainda não foi informado (Instrumento 1). As perguntas 22 e 23 são exclusivas para meninas e não são obrigatórias por enquanto.</div>}

      {inst.sections.map((s) => {
        const qs = s.questions.filter((q) => isVisible(q, all, own))
        if (!qs.length) return null
        return (
          <section key={s.title} className="card">
            <h3><span className="step" />{s.title}</h3>
            {s.intro && <p className="intro">{s.intro}</p>}
            {qs.map((q) => (
              <div key={q.id} id={'q-' + q.id} className={'q' + (missing.includes(q.id) ? ' missing' : '')}>
                <div className="qlabel">
                  {q.num && <b className="qnum">{q.num}</b>}{q.label}
                  {q.ref && <span className="ref">{q.ref}</span>}
                </div>
                <Field q={q} value={a[q.id]} onChange={(v) => set(q.id, v)} />
                {missing.includes(q.id) && <div className="err">Resposta obrigatória</div>}
              </div>
            ))}
          </section>
        )
      })}

      {altDif !== null && altDif > 0.5 && (
        <div className="note warn">Diferença entre as duas alturas: <b>{altDif.toFixed(1)} cm</b> (máximo admitido: 0,5 cm). Refaça a aferição.</div>
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

function Field({ q, value, onChange }) {
  switch (q.type) {
    case 'date':
      return <input className="inp" type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return (
        <div className="numrow">
          <input className="inp" type="number" inputMode="decimal" step={q.step} min={q.min} max={q.max} value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
          <span>{q.unit}</span>
        </div>
      )
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
