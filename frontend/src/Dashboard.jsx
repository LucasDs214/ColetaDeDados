import { go } from './router.js'
import { Icon, Avatar, Progress, Badge, theme, grad, ago } from './ui.jsx'

function Art() {
  return (
    <svg className="art" viewBox="0 0 360 230" aria-hidden="true">
      <rect x="20" y="24" width="168" height="192" rx="18" fill="#fff" opacity=".12" stroke="#fff" strokeOpacity=".35" />
      <rect x="40" y="44" width="70" height="10" rx="5" fill="#fff" opacity=".85" />
      {[84, 124, 164].map((y, i) => (
        <g key={y}>
          <circle cx="54" cy={y} r="11" fill={i < 2 ? '#7dd3fc' : 'none'} stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
          {i < 2 && <path d={`M48 ${y}l4 4 8-8`} stroke="#0d3580" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          <rect x="76" y={y - 9} width={96 - i * 14} height="8" rx="4" fill="#fff" opacity=".8" />
          <rect x="76" y={y + 3} width={64 - i * 10} height="6" rx="3" fill="#fff" opacity=".4" />
        </g>
      ))}
      <rect x="206" y="24" width="134" height="104" rx="18" fill="#fff" opacity=".16" stroke="#fff" strokeOpacity=".35" />
      {[34, 56, 44, 78, 62].map((h, i) => <rect key={i} x={224 + i * 22} y={112 - h} width="14" height={h} rx="5" fill={i === 3 ? '#7dd3fc' : '#fff'} opacity={i === 3 ? 1 : 0.8} />)}
      <rect x="206" y="144" width="134" height="72" rx="18" fill="#fff" opacity=".16" stroke="#fff" strokeOpacity=".35" />
      <circle cx="252" cy="180" r="22" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="9" />
      <circle cx="252" cy="180" r="22" fill="none" stroke="#7dd3fc" strokeWidth="9" strokeLinecap="round" strokeDasharray="96 140" transform="rotate(-90 252 180)" />
      <rect x="290" y="166" width="34" height="8" rx="4" fill="#fff" opacity=".85" /><rect x="290" y="184" width="22" height="6" rx="3" fill="#fff" opacity=".45" />
    </svg>
  )
}

function smooth(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`
  }
  return d
}

function AreaChart({ data }) {
  const W = 560, H = 210, L = 34, R = 12, T = 16, B = 28
  const max = Math.max(4, ...data.map((d) => d.count))
  const x = (i) => L + (i * (W - L - R)) / (data.length - 1)
  const y = (v) => T + (H - T - B) * (1 - v / max)
  const pts = data.map((d, i) => [x(i), y(d.count)])
  const line = smooth(pts)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Respostas registradas por semana">
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f7de1" stopOpacity=".35" /><stop offset="1" stopColor="#2f7de1" stopOpacity=".03" /></linearGradient></defs>
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="#d9dff0" strokeDasharray="3 4" /><text x={L - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#8b95b5">{Math.round(max * f)}</text></g>)}
      <path d={`${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#ag)" />
      <path d={line} fill="none" stroke="#1d5fd1" strokeWidth="3" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="#fff" stroke="#1d5fd1" strokeWidth="2"><title>{data[i].count} respostas</title></circle>)}
      {data.map((d, i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#8b95b5">{d.label}</text>)}
    </svg>
  )
}

export default function Dashboard({ schema, stats }) {
  const total = stats?.total ?? 0
  const weekly = (stats?.weekly || []).map((w) => ({ count: w.count, label: w.weekStart.slice(8, 10) + '/' + w.weekStart.slice(5, 7) }))
  const done = (stats?.cards || []).reduce((s, c) => s + c.complete, 0)
  const goal = schema.reduce((s, i) => s + (i.moments ? 3 : 1), 0) * total

  return (
    <>
      <section className="hero">
        <div>
          <h1>Coleta de Dados da Pesquisa</h1>
          <p>Fundação de Apoio à Escola Técnica (FAETEC). Escolha um instrumento, selecione o aluno e registre as respostas. Todos os dados são exportáveis em CSV para análise estatística.</p>
          <div className="herobtns">
            <button className="btn light" onClick={() => go('/participantes')}>Ver participantes</button>
            <button className="btn outline" onClick={() => go('/participantes/novo')}><Icon name="plus" size={16} />Novo participante</button>
          </div>
          <div className="herostats"><span><b>{total}</b> participantes</span><span><b>{done}</b> de {goal} questionários completos</span></div>
        </div>
        <Art />
      </section>

      <div className="sectionhead"><h2>Instrumentos em andamento</h2><a className="chip light" href="#/exportar"><Icon name="download" size={14} />Exportar CSV</a></div>
      <div className="cards5">
        {(stats?.cards || []).map((c) => {
          const t = theme(c.instrument, c.moment)
          const pct = total ? Math.round((c.complete / total) * 100) : 0
          return (
            <a key={c.instrument + c.moment} href={`#/q/${c.instrument}/${c.moment}`} className="icard card">
              <span className="itag" style={{ background: grad(t) }}><Icon name={t.icon} size={15} />{t.tag}</span>
              <h4>{t.name}</h4>
              <div className="imeta"><span>{c.complete} completos</span><span>{c.draft} rascunhos</span></div>
              <div className="iprog"><span>Progresso</span><b style={{ color: t.a }}>{pct}%</b><Progress value={pct} color={t.a} /></div>
            </a>
          )
        })}
      </div>

      <div className="twocol">
        <section className="card">
          <div className="sectionhead tight"><h2>Atividade</h2><span className="chip light">Últimas 8 semanas</span></div>
          <p className="muted small">Respostas salvas por semana (rascunhos e completas)</p>
          {weekly.length > 0 && <AreaChart data={weekly} />}
        </section>
        <section className="card">
          <div className="sectionhead tight"><h2>Últimas respostas</h2></div>
          {(stats?.recent || []).length === 0 && <p className="muted">Nenhuma resposta ainda. Escolha um instrumento acima e comece pela turma de demonstração.</p>}
          {(stats?.recent || []).map((r, i) => {
            const t = theme(r.instrument, r.moment)
            return (
              <a key={i} className="recent" href={`#/q/${r.instrument}/${r.moment}/${r.participantId}`}>
                <Avatar name={r.name} size={40} />
                <div><b>{r.name}</b><small>{t.short} · {ago(r.updatedAt)}</small></div>
                <Badge status={r.status} />
              </a>
            )
          })}
        </section>
      </div>
    </>
  )
}
