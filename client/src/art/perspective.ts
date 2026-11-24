/** One-point perspective for the highway scene. Depth 1 is the bottom of the picture. */

export const HORIZON = 620
export const VANISH_X = 720

const DROP = 900 - HORIZON
const NEAR = 0.85

const DASH_LENGTH = 0.46
const DASH_SPACING = 1.85
const DASHES = 20
const POLE_SPACING = 6.5
const POLES = 8
const POST_SPACING = 3.7
const POSTS = 12

const POLE_X = -1150
const POLE_HEIGHT = 820
const POST_X = 690
const POST_HEIGHT = 120

/** Paths for everything that moves past, after travelling some depth. */
export function drawRoadside(travelled: number) {
  const depths = (count: number, spacing: number) => {
    const offset = travelled % spacing
    return Array.from({ length: count }, (_, i) => NEAR + i * spacing - offset + spacing)
  }

  const dashes = depths(DASHES, DASH_SPACING)
    .map((z) => {
      const far = z + DASH_LENGTH
      return `M${at(-7, z)} ${at(7, z)} ${at(7, far)} ${at(-7, far)}Z`
    })
    .join('')

  const polesAt = depths(POLES, POLE_SPACING)
  const poles = polesAt
    .map((z) => {
      const w = 11 / z
      const x = VANISH_X + POLE_X / z
      const base = ground(z)
      const top = base - POLE_HEIGHT / z
      const arm = 95 / z
      const armY = top + 55 / z
      return `M${n(x - w)} ${n(base)}H${n(x + w)}V${n(top)}H${n(x - w)}ZM${n(x - arm)} ${n(armY)}H${n(x + arm)}v${n(14 / z)}H${n(x - arm)}Z`
    })
    .join('')

  const wires = [-85, 0, 85]
    .map((side) =>
      polesAt
        .map((z, i) => {
          const x = VANISH_X + (POLE_X + side) / z
          const y = ground(z) - (POLE_HEIGHT - 55) / z
          if (i === 0) return `M${n(x)} ${n(y)}`
          const middle = (z + polesAt[i - 1]) / 2
          const sagX = VANISH_X + (POLE_X + side) / middle
          const sagY = ground(middle) - (POLE_HEIGHT - 190) / middle
          return `Q${n(sagX)} ${n(sagY)} ${n(x)} ${n(y)}`
        })
        .join(''),
    )
    .join('')

  const postsAt = depths(POSTS, POST_SPACING)
  const posts = postsAt
    .map((z) => {
      const x = VANISH_X + POST_X / z
      const base = ground(z)
      return `M${n(x - 5 / z)} ${n(base)}h${n(10 / z)}v${n(-POST_HEIGHT / z)}h${n(-10 / z)}Z`
    })
    .join('')
  const reflectors = postsAt
    .map((z) => {
      const x = VANISH_X + POST_X / z
      const top = ground(z) - POST_HEIGHT / z
      return `M${n(x - 9 / z)} ${n(top)}h${n(18 / z)}v${n(22 / z)}h${n(-18 / z)}Z`
    })
    .join('')

  return { dashes, poles, wires, posts, reflectors }
}

const ground = (z: number) => HORIZON + DROP / z
const n = (value: number) => value.toFixed(1)
const at = (x: number, z: number) => `${n(VANISH_X + x / z)} ${n(ground(z))}`
