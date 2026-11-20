import { useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import './notfound.css'

export function NotFound() {
  useEffect(() => {
    document.title = 'Página no encontrada · Apuntes'
  }, [])
  return (
    <div className="nf">
      <svg viewBox="0 0 240 150" className="nf__art" aria-hidden="true">
        {/* a notebook page torn out along the right edge */}
        <path d="M20 10h120l8 14-9 13 10 15-9 14 9 15-10 14 9 15-8 14 9 16H20z" className="nf__page" />
        <path d="M44 10v130" className="nf__margin" />
        <path d="M52 38h70M52 58h56M52 78h74M52 98h48" className="nf__ruled" />
        <path d="M162 22l9 13-9 15 10 14-9 15 9 14-10 15 9 14-8 18" className="nf__gone" />
      </svg>
      <h1>Esta página no está en los apuntes</h1>
      <p>
        El enlace puede estar mal escrito o el tema cambió de unidad. Vuelve al índice o busca con <kbd>Ctrl</kbd> <kbd>K</kbd>.
      </p>
      <Link to="/" className="btn btn--line">
        <ArrowLeft size={16} /> Volver al índice
      </Link>
    </div>
  )
}
