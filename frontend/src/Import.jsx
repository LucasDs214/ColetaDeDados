import { useState } from 'react'
import { api } from './api.js'
import { go } from './router.js'
import { ensureCadastro } from './gate.js'
import { Icon, toast } from './ui.jsx'

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
const FIELD = {
  codigo: 'code', id: 'code', idparticipante: 'code', matricula: 'code',
  escola: 'school', unidade: 'school', unidadeescolar: 'school',
  nome: 'fullName', nomecompleto: 'fullName', aluno: 'fullName',
  nascimento: 'birthDate', datanascimento: 'birthDate', datadenascimento: 'birthDate',
  serieturma: 'gradeClass', turma: 'gradeClass', serie: 'gradeClass',
  email: 'email',
}

function parseCsv(text) {
  const t = text.replace(/^\uFEFF/, '')
  const first = t.split(/\r?\n/)[0] || ''
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ','
  const rows = []
  let row = [], cur = '', q = false
  const endRow = () => { row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = [] }
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; endRow() }
    else cur += c
  }
  if (cur !== '' || row.length) endRow()
  return rows
}

const isoDate = (v) => {
  const s = (v || '').trim()
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s
}

function toRows(text) {
  const raw = parseCsv(text)
  if (raw.length < 2) return { rows: [], problem: 'O arquivo precisa ter o cabeçalho e ao menos uma linha.' }
  const cols = raw[0].map((h) => FIELD[norm(h)])
  if (!cols.includes('code') || !cols.includes('school') || !cols.includes('fullName'))
    return { rows: [], problem: 'O cabeçalho precisa ter as colunas: codigo, escola e nome (opcionais: nascimento, serie_turma, email).' }
  const rows = raw.slice(1).map((r) => {
    const o = { code: '', school: '', fullName: '', birthDate: '', email: '', gradeClass: '' }
    cols.forEach((c, i) => { if (c) o[c] = (r[i] || '').trim() })
    o.birthDate = isoDate(o.birthDate)
    return o
  })
  return { rows, problem: '' }
}

export default function Import() {
  const [rows, setRows] = useState([])
  const [problem, setProblem] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null)
    const r = toRows(await file.text())
    setRows(r.rows); setProblem(r.problem)
  }
  const send = async () => {
    setBusy(true)
    try {
      let res
      try { res = await api.importParticipants(rows) } catch (x) { if (x.cadastro && (await ensureCadastro())) res = await api.importParticipants(rows); else throw x }
      setResult(res); toast(`${res.created} criados, ${res.updated} atualizados`)
    } catch (x) { setProblem(x.message) }
    setBusy(false)
  }
  const template = () => {
    const csv = '\uFEFFcodigo;escola;nome;nascimento;serie_turma;email\r\nFAE-001;FAETEC Exemplo;Maria da Silva;2009-05-21;1º ano · Turma 101;\r\n'
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: 'modelo_cadastro_participantes.csv' })
    document.body.appendChild(a); a.click(); a.remove()
  }
  return (
    <>
      <a className="back" href="#/participantes"><Icon name="left" size={16} />Participantes</a>
      <section className="card formcard">
        <h2>Importar cadastro de participantes</h2>
        <p className="muted">Carregue a lista de alunos já cadastrados. IDs novos são criados e IDs que já existem são atualizados. Colunas: <code>codigo</code>, <code>escola</code>, <code>nome</code>, <code>nascimento</code> (AAAA-MM-DD ou DD/MM/AAAA), <code>serie_turma</code>, <code>email</code>.</p>
        <div className="pactions">
          <button className="btn ghost sm" onClick={template}><Icon name="download" size={14} />Baixar modelo</button>
          <input type="file" accept=".csv,text/csv" onChange={onFile} />
        </div>
        {problem && <div className="note warn">{problem}</div>}
        {rows.length > 0 && !result && (
          <>
            <p><b>{rows.length}</b> linhas prontas para importar. Prévia das 5 primeiras:</p>
            <div className="tablecard"><table><thead><tr><th>ID</th><th>Nome</th><th>Escola</th><th>Turma</th></tr></thead>
              <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i}><td>{r.code}</td><td>{r.fullName}</td><td>{r.school}</td><td>{r.gradeClass}</td></tr>)}</tbody></table></div>
            <div className="actions"><button className="btn" disabled={busy} onClick={send}>{busy ? 'Importando…' : `Importar ${rows.length} participantes`}</button></div>
          </>
        )}
        {result && (
          <div className="note info">
            <b>{result.created}</b> criados · <b>{result.updated}</b> atualizados · <b>{result.errors.length}</b> com erro.
            {result.errors.length > 0 && <ul>{result.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}
            <div><button className="btn sm" onClick={() => go('/participantes')}>Ver participantes</button></div>
          </div>
        )}
      </section>
    </>
  )
}
