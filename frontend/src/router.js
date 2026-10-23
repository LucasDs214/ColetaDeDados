import { useEffect, useState } from 'react'

const parse = () => {
  const h = location.hash.replace(/^#/, '') || '/'
  const [path, qs] = h.split('?')
  return { path, params: new URLSearchParams(qs || ''), parts: path.split('/').filter(Boolean) }
}

export function useRoute() {
  const [r, setR] = useState(parse)
  useEffect(() => {
    const f = () => { setR(parse()); window.scrollTo(0, 0) }
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])
  return r
}

export const go = (path) => { location.hash = path }
