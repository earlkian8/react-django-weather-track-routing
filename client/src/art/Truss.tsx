import { useId } from 'react'

/** The steel bridge that overhead signs hang from. */
export function Truss({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg className={className} width="100%" height="46" aria-hidden>
      <defs>
        <pattern id={id} width="56" height="46" patternUnits="userSpaceOnUse">
          <path d="M0 40 28 6l28 34" fill="none" stroke="#8b979b" strokeWidth="4" />
          <path d="M0 40 28 6l28 34" fill="none" stroke="#c9d2d3" strokeWidth="1.500" />
          <path d="M28 6v34" stroke="#75828a" strokeWidth="3" />
        </pattern>
      </defs>
      <rect width="100%" height="46" fill={`url(#${id})`} />
      <rect y="1" width="100%" height="8" fill="#aab4b7" />
      <rect y="1" width="100%" height="2.500" fill="#dfe5e5" />
      <rect y="36" width="100%" height="9" fill="#9aa5a9" />
      <rect y="36" width="100%" height="2.500" fill="#d3dada" />
    </svg>
  )
}
