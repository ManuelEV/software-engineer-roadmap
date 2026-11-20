import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useParams } from 'react-router'
import { Menu, Moon, Search, Sun } from 'lucide-react'
import { units, isUnitId } from '../../content/units'
import { useTheme } from '../../lib/theme'
import { SearchPalette } from './SearchPalette'
import { MobileNav } from './MobileNav'
import { Logo } from './Logo'
import './layout.css'

export function AppShell() {
  const { unit } = useParams()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const unitId = isUnitId(unit) ? unit : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.closest('input, textarea, [contenteditable="true"]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    setNavOpen(false)
    setSearchOpen(false)
  }, [location.pathname])

  const ThemeIcon = theme === 'dark' ? Sun : Moon
  const themeLabel = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'

  return (
    <div className="shell" data-line={unitId}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="topbar__brand" aria-label="Apuntes, inicio">
            <Logo />
            <span className="topbar__name">Apuntes</span>
            <span className="topbar__tag">de ingeniería de software</span>
          </Link>

          <nav className="topbar__units" aria-label="Unidades">
            {units.map((u) => (
              <NavLink key={u.id} to={`/${u.id}`} className="topbar__unit" data-line={u.id}>
                <span className="unit-tab">{u.number}</span>
                <span className="topbar__unit-name">{u.short}</span>
              </NavLink>
            ))}
          </nav>

          <div className="topbar__actions">
            <button type="button" className="topbar__search" onClick={() => setSearchOpen(true)} aria-label="Buscar (Ctrl+K)">
              <Search size={17} />
              <span className="topbar__search-text">Buscar</span>
              <kbd className="topbar__kbd">Ctrl K</kbd>
            </button>
            <button type="button" className="icon-btn" onClick={toggle} aria-label={themeLabel} title={themeLabel}>
              <ThemeIcon size={18} />
            </button>
            <button type="button" className="icon-btn topbar__menu" onClick={() => setNavOpen(true)} aria-label="Abrir índice de unidades" aria-expanded={navOpen}>
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      <main id="contenido" className="shell__main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__brand">
            <Logo />
            <span>Apuntes</span>
          </div>
          <p>
            Apuntes para explorar y consultar arquitectura, system design, patrones y desarrollo con IA.
          </p>
        </div>
      </footer>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
      <ScrollRestoration />
    </div>
  )
}
