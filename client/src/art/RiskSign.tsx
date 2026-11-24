import type { CheckpointRisk } from '../api/types'
import { riskLabel } from '../domain/risk'
import { riskSignMarkup } from './riskSignMarkup'

interface Props {
  risk: CheckpointRisk
  size?: number
  /** Omit the accessible name where the label is written beside the sign. */
  decorative?: boolean
}

/** Each risk has its own sign shape, so color is never the only cue. */
export function RiskSign({ risk, size = 18, decorative = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ flex: 'none' }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': riskLabel(risk) })}
      dangerouslySetInnerHTML={{ __html: riskSignMarkup(risk, `var(--risk-${risk})`) }}
    />
  )
}
