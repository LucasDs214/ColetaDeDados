import { useState } from 'react'
import { downloadCsv } from './api.js'
import { Icon, toast } from './ui.jsx'

const FILES = [
  ['all', 'Banco consolidado', 'Uma linha por participante × momento, com todos os instrumentos. Ideal para análise estatística.', 'layers'],
  ['i1', 'Instrumento 1', 'Sociodemográfico e atividade física (Q7–Q21).', 'clipboard'],
  ['i2', 'Instrumento 2', 'Antropometria nos momentos M1, M2 e M3.', 'ruler'],
  ['i6', 'Instrumento 6', 'CCEB 2026, com escore, classe e renda média.', 'coins'],
  ['participants', 'Cadastro', 'Lista de participantes (ID, unidade, turma).', 'users'],
  ['dictionary', 'Dicionário de variáveis', 'Codebook: nome de cada coluna, enunciado, códigos e rótulos, unidades e faixas. Use junto com os CSVs.', 'file'],
]

export default function Export() {
  const [o, setO] = useState({ labels: false, identified: false, decimal: 'comma' })
  const [busy, setBusy] = useState('')
  const run = async (k) => {
    setBusy(k)
    try { await downloadCsv(k, o); toast('Download iniciado') } catch (x) { toast(x.message, 'err') }
    setBusy('')
  }
  const Opt = ({ k, children, checked, onChange }) => (
    <label className="switch"><input type="checkbox" checked={checked} onChange={onChange} /><i /><span>{children}</span></label>
  )
  return (
    <>
      <div className="sectionhead"><h2>Exportar dados (CSV)</h2></div>
      <section className="card optscard">
        <Opt checked={o.labels} onChange={(e) => setO({ ...o, labels: e.target.checked })}>Usar <b>rótulos</b> das opções em vez de códigos numéricos</Opt>
        <Opt checked={o.decimal === 'point'} onChange={(e) => setO({ ...o, decimal: e.target.checked ? 'point' : 'comma' })}>Decimal com <b>ponto</b> (padrão: vírgula)</Opt>
        <Opt checked={o.identified} onChange={(e) => setO({ ...o, identified: e.target.checked })}>Incluir dados <b>identificáveis</b> (nome, nascimento, e-mail)</Opt>
        {o.identified && <div className="note warn">Por padrão a exportação é pseudonimizada (só o ID). Dados de menores: use a versão identificada apenas quando necessário.</div>}
        <p className="muted small">Formato: separador “;” · UTF-8 com BOM · abre direto no Excel; no R use <code>read.csv2</code>.</p>
      </section>
      <div className="cards5 exp">
        {FILES.map(([k, title, desc, icon]) => (
          <div key={k} className="card icard">
            <span className="exicon"><Icon name={icon} size={20} /></span>
            <h4>{title}</h4><p className="muted small">{desc}</p>
            <button className="btn sm cta" disabled={!!busy} onClick={() => run(k)}><Icon name="download" size={14} />{busy === k ? 'Gerando…' : 'Baixar CSV'}</button>
          </div>
        ))}
      </div>
    </>
  )
}
