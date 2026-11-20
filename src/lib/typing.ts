/**
 * Per-character delays for `text`, like a hand that writes: a little uneven,
 * with a short pause after spaces and punctuation. Deterministic, so chained
 * pieces can be scheduled with `typeDuration`.
 */
export function schedule(text: string, speed: number): number[] {
  const out: number[] = []
  let t = 0
  for (let i = 0; i < text.length; i++) {
    const jitter = (((i + 1) * 9301 + 49297) % 233280) / 233280 // 0..1
    t += speed * (0.6 + jitter * 0.8)
    const prev = text[i - 1]
    if (prev === ' ') t += speed * 0.5
    if (prev && ',.:;—'.includes(prev)) t += speed * 2.5
    out.push(t)
  }
  return out
}

/** How long `text` takes to write at `speed` (ms per character, on average). */
export function typeDuration(text: string, speed = 40) {
  const s = schedule(text, speed)
  return s.length ? s[s.length - 1] : 0
}
