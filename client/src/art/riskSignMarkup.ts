import type { CheckpointRisk } from '../api/types'

const DARK = '#14191c'

/** Sign faces as SVG markup, shared by the page and the map's image atlas. */
export function riskSignMarkup(risk: CheckpointRisk, color: string): string {
  switch (risk) {
    case 'low': // guide sign
      return `<rect x="2.500" y="4.500" width="19" height="15" rx="3" fill="${color}"/>
        <path d="m8 12.200 2.700 2.700 5.300-5.500" fill="none" stroke="#fff" stroke-width="2.400" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'moderate': // warning diamond
      return `<rect x="4.600" y="4.600" width="14.800" height="14.800" rx="2" transform="rotate(45 12 12)" fill="${color}" stroke="${DARK}" stroke-width="1.400"/>
        <path d="M12 7.500v5.200" stroke="${DARK}" stroke-width="2.400" stroke-linecap="round"/><circle cx="12" cy="16.300" r="1.400" fill="${DARK}"/>`
    case 'high': // slow-moving-vehicle triangle
      return `<path d="M12 2.600 22.400 20.600H1.600Z" fill="${color}" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M12 9v5" stroke="#fff" stroke-width="2.400" stroke-linecap="round"/><circle cx="12" cy="17.600" r="1.400" fill="#fff"/>`
    case 'severe': // stop octagon
      return `<path d="M7.800 2h8.400L22 7.800v8.400L16.200 22H7.800L2 16.200V7.800Z" fill="${color}"/>
        <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2.600" stroke-linecap="round"/>`
    case 'no_travel': // do not enter
      return `<circle cx="12" cy="12" r="10.200" fill="${color}"/><rect x="5.500" y="9.800" width="13" height="4.400" rx="1" fill="#fff"/>`
    case 'unknown':
      return `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="3.600 2.600"/>
        <path d="M9.500 9.700a2.500 2.500 0 1 1 3.600 2.300c-.8.4-1.100.9-1.100 1.700" fill="none" stroke="${color}" stroke-width="1.900" stroke-linecap="round"/><circle cx="12" cy="16.700" r="1.200" fill="${color}"/>`
  }
}
