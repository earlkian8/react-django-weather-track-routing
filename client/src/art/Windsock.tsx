const BANDS = 5
const BAND_LENGTH = 7.2

interface Props {
  mph: number
}

/**
 * Highway windsock: each band straightens in turn as wind rises, all of them by about 35 mph.
 * Shows speed only. The forecast has no wind direction, so it always points downroad.
 * Drawn around the top of its pole, at 0,0.
 */
export function Windsock({ mph }: Props) {
  let x = 2
  let y = 0
  const bands = []
  for (let i = 0; i < BANDS; i++) {
    const lift = Math.min(1, Math.max(0, (mph - i * 5.5) / 11))
    const angle = ((1 - lift) * 78 * Math.PI) / 180
    const endX = x + Math.cos(angle) * BAND_LENGTH
    const endY = y + Math.sin(angle) * BAND_LENGTH
    const half = 4.6 - i * 0.55
    const nextHalf = half - 0.55
    const nx = Math.sin(angle)
    const ny = -Math.cos(angle)
    bands.push(
      <path
        key={i}
        d={`M${x + nx * half} ${y + ny * half}L${endX + nx * nextHalf} ${endY + ny * nextHalf}L${endX - nx * nextHalf} ${endY - ny * nextHalf}L${x - nx * half} ${y - ny * half}Z`}
        fill={i % 2 ? '#fff' : '#f26a21'}
        stroke="#20292d"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />,
    )
    x = endX
    y = endY
  }
  return (
    <g>
      <path d="M0-6v48" stroke="#20292d" strokeWidth="2" strokeLinecap="round" />
      {bands}
    </g>
  )
}
