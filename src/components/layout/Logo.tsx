/** A notebook page: margin rule, three written lines, one of them highlighted. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" className="logo__ground" />
      <path d="M10.5 4v24" className="logo__margin" />
      <rect x="13.2" y="13.3" width="11.6" height="5.4" rx="1.2" className="logo__hl" />
      <path d="M14.5 10h11M14.5 16h8.5M14.5 22h11" className="logo__ink" />
    </svg>
  )
}
