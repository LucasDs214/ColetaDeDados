import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import { useRoute, go } from './router.js'
import { Icon, Toasts, theme } from './ui.jsx'
import Dashboard from './Dashboard.jsx'
import { People, Detail, Editor } from './People.jsx'
import { Roster, Fill } from './Collect.jsx'
import Export from './Export.jsx'

export default function App() {
  const route = useRoute()
  const [schema, setSchema] = useState(null)
  const [stats, setStats] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  const refresh = useCallback(() => api.stats().then(setStats).catch(() => {}), [])
  useEffect(() => { api.schema().then((s) => setSchema(s.instruments)).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { refresh() }, [route.path, refresh])

  const [p0, p1, p2, p3] = route.parts
  const active = !p0 ? 'home' : p0 === 'participantes' ? 'people' : p0 === 'exportar' ? 'export' : p0 === 'q' ? `q-${p1}-${p2}` : ''
  const cards = stats?.cards || []
  const total = stats?.total || 0

  let page = null
  if (schema) {
    if (!p0) page = <Dashboard schema={schema} stats={stats} />
    else if (p0 === 'participantes' && !p1) page = <People params={route.params} schema={schema} />
    else if (p0 === 'participantes' && p1 === 'novo') page = <Editor id={null} />
    else if (p0 === 'participantes' && p2 === 'editar') page = <Editor id={p1} />
    else if (p0 === 'participantes') page = <Detail id={p1} schema={schema} />
    else if (p0 === 'q' && p3) page = <Fill key={p1 + p2 + p3} inst={p1} moment={p2} pid={p3} schema={schema} />
    else if (p0 === 'q') page = <Roster inst={p1} moment={p2} schema={schema} />
    else if (p0 === 'exportar') page = <Export />
    else page = <p>Página não encontrada.</p>
  }

  const NavLink = ({ to, id, icon, children }) => (
    <a href={'#' + to} className={'navlink' + (active === id ? ' on' : '')}><Icon name={icon} size={17} />{children}</a>
  )

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#/" className="brand"><span className="logo">F</span>FAETEC<small>Coleta</small></a>
        <nav className="topnav">
          <a href="#/" className={active === 'home' ? 'on' : ''}>Painel</a>
          <a href="#/participantes" className={active === 'people' ? 'on' : ''}>Participantes</a>
          <a href="#/exportar" className={active === 'export' ? 'on' : ''}>Exportar CSV</a>
        </nav>
        <form className="search" onSubmit={(e) => { e.preventDefault(); go('/participantes' + (q ? '?q=' + encodeURIComponent(q) : '')) }}>
          <input placeholder="Buscar aluno por nome ou ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button aria-label="Buscar"><Icon name="search" size={16} /></button>
        </form>
        <span className="chip"><Icon name="flask" size={14} />Versão de testes</span>
      </header>

      <div className="layout">
        <aside className="side card">
          <div className="sidegroup">
            <div className="sidetitle">Menu</div>
            <NavLink to="/" id="home" icon="home">Painel</NavLink>
            <NavLink to="/participantes" id="people" icon="users">Participantes <em>{total}</em></NavLink>
            <NavLink to="/exportar" id="export" icon="download">Exportar CSV</NavLink>
          </div>
          <div className="sidegroup">
            <div className="sidetitle">Instrumentos</div>
            {cards.map((c) => {
              const t = theme(c.instrument, c.moment)
              return (
                <a key={c.instrument + c.moment} href={`#/q/${c.instrument}/${c.moment}`} className={'navlink small' + (active === `q-${c.instrument}-${c.moment}` ? ' on' : '')}>
                  <i className="dot" style={{ background: t.a }} />{t.short}<em>{c.complete}/{total}</em>
                </a>
              )
            })}
          </div>
          <div className="sidegroup legend">
            <div className="sidetitle">Legenda</div>
            <span><b className="badge ok">Completo</b></span>
            <span><b className="badge warn">Rascunho</b></span>
            <span><b className="badge idle">Pendente</b></span>
          </div>
        </aside>
        <main className="content">
          {err && <div className="note warn">Não foi possível carregar os instrumentos: {err}</div>}
          {!schema && !err && <p className="muted">Carregando…</p>}
          {page}
        </main>
      </div>
      <Toasts />
    </div>
  )
}
