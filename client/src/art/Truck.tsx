import { motion, type MotionValue } from 'motion/react'

const WHEELS = [22, 39, 128, 145, 187]

interface Props {
  width?: number
  /** Wheel rotation in degrees. */
  spin?: MotionValue<number>
  headlights?: boolean
}

/** A tractor-trailer from the side, heading right. */
export function Truck({ width = 92, spin, headlights = false }: Props) {
  return (
    <svg width={width} height={(width * 62) / 208} viewBox="0 0 208 62" style={{ overflow: 'visible' }} aria-hidden>
      {headlights && <path d="M203 40 290 34v22l-87-8Z" fill="#ffe9a3" opacity="0.5" />}
      <rect x="3" y="4" width="133" height="37" rx="1.500" fill="#f7faf8" stroke="#20292d" strokeWidth="2" />
      <path d="M14 5v35M25 5v35M36 5v35M47 5v35M58 5v35M69 5v35M80 5v35M91 5v35M102 5v35M113 5v35M124 5v35" stroke="#d5deda" strokeWidth="1.200" />
      <path d="M4 14h131v9H4Z" fill="#00644a" />
      <path d="M4 37.500h131" stroke="#b4232f" strokeWidth="2.500" strokeDasharray="7 5" />
      <path d="M8 42h120l3 6H60l-4 7H48l2-7H8Z" fill="#20292d" />
      <path d="M140 47V13c0-5 3-8 8-8h15c3 0 5 1 6 4l5 12 21 4c4 .8 7 3.500 7 8v14Z" fill="#ffc629" stroke="#20292d" strokeWidth="2" strokeLinejoin="round" />
      <path d="M163 11h3.500l5 11H163Z" fill="#9cc4cf" stroke="#20292d" strokeWidth="1.500" strokeLinejoin="round" />
      <path d="M146 11h10v9h-10Z" fill="#9cc4cf" stroke="#20292d" strokeWidth="1.500" strokeLinejoin="round" />
      <path d="M160 24v21M174 22v24" stroke="#20292d" strokeWidth="1.300" opacity="0.55" />
      <path d="M140 30h62" stroke="#20292d" strokeWidth="1.500" opacity="0.35" />
      <rect x="136" y="14" width="3" height="28" fill="#8d9995" />
      <path d="M137.500 14V1" stroke="#8d9995" strokeWidth="3" strokeLinecap="round" />
      <rect x="198" y="35" width="5" height="6" rx="1.500" fill="#fff3c4" stroke="#20292d" strokeWidth="1.200" />
      <path d="M136 45h69v4h-69Z" fill="#20292d" />
      {WHEELS.map((x) => (
        <g key={x} transform={`translate(${x} 51)`}>
          <circle r="9" fill="#171d20" />
          <motion.g style={{ rotate: spin }}>
            <circle r="4.600" fill="#cfd8d4" />
            <path d="M-4.600 0h9.200M0-4.600v9.200" stroke="#59656a" strokeWidth="1.500" />
          </motion.g>
        </g>
      ))}
    </svg>
  )
}
