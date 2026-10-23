async function req(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

export const api = {
  schema: () => req('GET', '/schema'),
  stats: () => req('GET', '/stats'),
  participants: (q = '') => req('GET', '/participants?q=' + encodeURIComponent(q)),
  participant: (id) => req('GET', `/participants/${id}`),
  createParticipant: (p) => req('POST', '/participants', p),
  updateParticipant: (id, p) => req('PUT', `/participants/${id}`, p),
  deleteParticipant: (id) => req('DELETE', `/participants/${id}`),
  saveResponse: (id, inst, moment, status, data) => req('PUT', `/participants/${id}/responses/${inst}/${moment}`, { status, data }),
}

export async function downloadCsv(what, { labels, identified, decimal }) {
  const qs = new URLSearchParams({ labels: !!labels, identified: !!identified, decimal })
  const res = await fetch(`/api/export/${what}.csv?${qs}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Falha na exportação')
  const name = /filename="?([^";]+)/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `faetec_${what}.csv`
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
