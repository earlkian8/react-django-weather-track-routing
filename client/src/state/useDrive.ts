import { animate, useMotionValue, useMotionValueEvent, useReducedMotion, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { etaAt, mileAt, type Track } from '../domain/track'

const FULL_TRIP_S = 28
const SEEK_S = 0.55

export interface Drive {
  /** The one clock behind the truck, the map and the weather, in epoch ms. */
  clock: MotionValue<number>
  /** Where the truck is at that time. */
  mile: MotionValue<number>
  playing: boolean
  toggle: () => void
  /** Jumps to a mile, or drives there. */
  seek: (mile: number, smooth?: boolean) => void
  setClock: (time: number) => void
}

export function useDrive(track: Track): Drive {
  const still = useReducedMotion()
  const start = track.stops[0].time
  const end = track.stops.at(-1)!.time
  const clock = useMotionValue(start)
  const mile = useMotionValue(0)
  const running = useRef<AnimationPlaybackControls>(null)
  const [playing, setPlaying] = useState(false)

  function stop() {
    running.current?.stop()
    running.current = null
    setPlaying(false)
  }

  useMotionValueEvent(clock, 'change', (time) => mile.set(mileAt(track, time)))

  // On another route the clock keeps its time, which puts the truck at a different mile.
  useEffect(() => {
    mile.set(mileAt(track, clock.get()))
    return () => running.current?.stop()
  }, [track, clock, mile])

  function setClock(time: number) {
    stop()
    clock.set(time)
  }

  function seek(target: number, smooth = false) {
    const time = etaAt(track, target)
    stop()
    if (smooth && !still) running.current = animate(clock, time, { duration: SEEK_S, ease: 'easeInOut' })
    else clock.set(time)
  }

  function toggle() {
    if (playing) return stop()
    stop()
    const from = clock.get() >= end || clock.get() < start ? start : clock.get()
    clock.set(from)
    setPlaying(true)
    running.current = animate(clock, end, {
      duration: (FULL_TRIP_S * (end - from)) / (end - start),
      ease: 'linear',
      onComplete: () => setPlaying(false),
      onStop: () => setPlaying(false),
    })
  }

  return { clock, mile, playing, toggle, seek, setClock }
}
