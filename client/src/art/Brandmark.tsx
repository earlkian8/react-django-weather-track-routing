/** The crosswind warning sign. */
export function Brandmark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect x="20" y="-0.500" width="28.500" height="28.500" rx="4.500" transform="rotate(45 20 -0.500)" fill="#20292d" />
      <rect x="20" y="2" width="25" height="25" rx="3.200" transform="rotate(45 20 2)" fill="#ffc629" />
      <path d="M13 11.500V30" stroke="#20292d" strokeWidth="2.600" strokeLinecap="round" />
      <path d="M13 10.500 20 12.400v6.700L13 21.500ZM22.200 13l4.300 1.500v3.300l-4.300 1ZM28.500 15.100l3.300 1.500-3.300.8Z" fill="#20292d" />
    </svg>
  )
}
