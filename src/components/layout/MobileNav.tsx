import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { units } from '../../content/units'
import { UnitIndex } from './UnitIndex'

export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduced = useReducedMotion()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="mnav"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.nav
            className="mnav__sheet"
            aria-label="Índice de unidades"
            initial={reduced ? { opacity: 0 } : { x: '100%' }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mnav__head">
              <span className="mnav__title">Índice</span>
              <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar índice">
                <X size={20} />
              </button>
            </div>
            <div className="mnav__body">
              {units.map((u) => (
                <details key={u.id} className="mnav__unit" data-line={u.id}>
                  <summary>
                    <span className="unit-tab">{u.number}</span>
                    <span>{u.title}</span>
                  </summary>
                  <UnitIndex unit={u} compact />
                </details>
              ))}
            </div>
          </motion.nav>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
