import { useCallback, useSyncExternalStore } from 'react'

/**
 * The reader's preferred code language ("Java", "Python", "TypeScript"…), shared
 * live by every <CodeTabs> and every animated widget's <CodeTrace> on the page.
 * Remembered on this device only, as a display preference.
 */
const KEY = 'apuntes:codetab'
const listeners = new Set<() => void>()

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

let current = read()

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function setCodeLang(label: string) {
  current = label
  try {
    localStorage.setItem(KEY, label)
  } catch {
    /* storage unavailable: keep it for this visit */
  }
  listeners.forEach((l) => l())
}

/** Preferred label (or null) and a setter. */
export function useCodeLang(): [string | null, (label: string) => void] {
  const pref = useSyncExternalStore(subscribe, () => current, () => current)
  return [pref, useCallback((l: string) => setCodeLang(l), [])]
}

/**
 * Which of `labels` to show: the reader's choice if present, else Java (the
 * notes' default for interview code), else the first one.
 */
export function pickLang(labels: string[], pref: string | null): number {
  const byPref = pref ? labels.indexOf(pref) : -1
  if (byPref >= 0) return byPref
  const java = labels.indexOf('Java')
  return java >= 0 ? java : 0
}
