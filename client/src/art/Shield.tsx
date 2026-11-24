import { parseRoad } from '../domain/roads'

const INTERSTATE = 'M5 9C12 11 18 9 24 4c6 5 12 7 19 5 4.6 11.600 2.400 27.500-19 37C2.600 36.500.4 20.600 5 9Z'
const US = 'M9 3.500c4 3.600 10 3.600 15 .8 5 2.800 11 2.800 15-.8l6 6.300c-3.700 6.500.3 11.600.3 17.700C45.300 38 33 39.800 24 45 15 39.800 2.700 38 2.700 27.500c0-6.100 4-11.200.3-17.700Z'

interface Props {
  road: string
  size?: number
}

/** A road number: the standard shield for US roads, a plain plate for the rest of the world. */
export function Shield({ road, size = 32 }: Props) {
  const parsed = parseRoad(road)
  if (parsed.kind === 'named') return <span style={{ fontWeight: 700, fontSize: size * 0.48 }}>{parsed.name}</span>
  if (parsed.kind === 'badge') {
    return (
      <span
        style={{
          padding: `${size * 0.14}px ${size * 0.2}px ${size * 0.07}px`,
          border: `${Math.max(1.5, size * 0.05)}px solid #14191c`,
          borderRadius: size * 0.16,
          background: '#fff',
          color: '#14191c',
          fontSize: size * 0.48,
          fontWeight: 800,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
        }}
      >
        {parsed.text}
      </span>
    )
  }
  const { kind, number } = parsed
  const long = number.length > 2
  return (
    <svg
      width={long ? size * 1.2 : size}
      height={size}
      viewBox="0 0 48 48"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${kind === 'interstate' ? 'Interstate' : 'US'} ${number}`}
    >
      {kind === 'interstate' ? <Interstate number={number} long={long} /> : <UsHighway number={number} long={long} />}
    </svg>
  )
}

interface FaceProps {
  number: string
  long: boolean
}

function Interstate({ number, long }: FaceProps) {
  return (
    <>
      <path d={INTERSTATE} fill="#fff" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      <path d={INTERSTATE} fill="#17407c" />
      <path d="M5 9C12 11 18 9 24 4c6 5 12 7 19 5 .95 2.400 1.600 5 1.900 7.500H3.100C3.400 14 4.050 11.400 5 9Z" fill="#b4232f" />
      <path d="M3 17h42" stroke="#fff" strokeWidth="2" />
      <text {...digits(long)} y="36.500" fontSize={long ? 19 : 21} fill="#fff">{number}</text>
    </>
  )
}

function UsHighway({ number, long }: FaceProps) {
  return (
    <>
      <path d={US} fill="#fff" stroke="#14191c" strokeWidth="2.500" strokeLinejoin="round" />
      <text {...digits(long)} y="33" fontSize={long ? 20 : 23} fill="#14191c">{number}</text>
    </>
  )
}

const digits = (long: boolean) => ({
  x: 24,
  textAnchor: 'middle' as const,
  fontFamily: 'var(--font)',
  fontWeight: 800,
  // The 3-digit marker is stretched sideways, so its digits are squeezed back.
  textLength: long ? 33 : undefined,
  lengthAdjust: 'spacingAndGlyphs' as const,
})
