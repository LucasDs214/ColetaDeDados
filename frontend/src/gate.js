import { api, getCadastroPw, setCadastroPw } from './api.js'
import { askPassword, toast } from './ui.jsx'

let cfg = null
export async function getConfig() {
  if (!cfg) cfg = await api.config().catch(() => ({ banco: '', cadastroProtegido: false }))
  return cfg
}

/** Garante a senha de cadastro (quando o servidor exige) antes de criar/editar/excluir/importar participantes. */
export async function ensureCadastro() {
  const c = await getConfig()
  if (!c.cadastroProtegido || getCadastroPw()) return true
  for (let i = 0; i < 3; i++) {
    const pw = await askPassword(i ? 'Senha incorreta. Tente novamente.' : 'Esta ação altera o cadastro de participantes. Informe a senha de cadastro.')
    if (pw == null) return false
    setCadastroPw(pw)
    try { await api.checkCadastro(); return true } catch { setCadastroPw('') }
  }
  toast('Senha de cadastro incorreta', 'err')
  return false
}
