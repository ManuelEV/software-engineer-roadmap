import type { AnchorHTMLAttributes } from 'react'
import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'

/** Internal links go through the router (no reload); external ones open in a new tab. */
export function SmartLink({ href = '', children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link to={href} {...rest}>
        {children}
      </Link>
    )
  }
  if (href.startsWith('#')) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
      <ArrowUpRight size={13} strokeWidth={2.25} className="ext-icon" aria-label="(abre en otra pestaña)" />
    </a>
  )
}
