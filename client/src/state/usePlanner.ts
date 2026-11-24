import { useState } from 'react'
import { ApiError, createPlan, searchPlaces } from '../api/client'
import type { Place, Plan } from '../api/types'
import { matchPlace } from '../domain/place'
import { departureZone, emptyTrip, errorsFromApi, nextHalfHour, toRequest, validateTrip, type Trip, type TripErrors } from '../domain/trip'
import { load, local, save, session } from './storage'

const TRIP_KEY = 'trip'
const PLAN_KEY = 'plan'

/** The trip being planned and the latest plan for it. */
export function usePlanner() {
  const [trip, setTrip] = useState<Trip>(restoreTrip)
  const [departTouched, setDepartTouched] = useState(false)
  const [errors, setErrors] = useState<TripErrors>({})
  const [pending, setPending] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(() => load(session, PLAN_KEY))

  function change(patch: Partial<Trip>) {
    setTrip((current) => {
      const next = { ...current, ...patch }
      // Until a time is chosen, the suggestion follows the origin's clock.
      if (patch.origin?.place && !departTouched) next.depart = nextHalfHour(Date.now(), departureZone(patch.origin.place))
      return next
    })
    if (patch.depart) setDepartTouched(true)
    setErrors((current) => {
      const next = { ...current }
      for (const field of Object.keys(patch)) delete next[field as keyof Trip]
      return next
    })
  }

  async function submit(): Promise<TripErrors> {
    if (pending) return {}
    const found = validateTrip(trip)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return found
    }

    setErrors({})
    setPending(true)
    try {
      const { trip: matched, errors: unmatched } = await matchPlaces(trip, departTouched)
      setTrip(matched)
      const problems = Object.keys(unmatched).length > 0 ? unmatched : validateTrip(matched)
      if (Object.keys(problems).length > 0) {
        setErrors(problems)
        return problems
      }
      const result = await createPlan(toRequest(matched, matched.origin.place!, matched.destination.place!))
      save(local, TRIP_KEY, matched)
      save(session, PLAN_KEY, result)
      setPlan(result)
      return {}
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      const problems = errorsFromApi(error)
      setErrors(problems)
      return problems
    } finally {
      setPending(false)
    }
  }

  function clearPlan() {
    save(session, PLAN_KEY, null)
    setPlan(null)
    setErrors({})
  }

  return { trip, change, errors, pending, submit, plan, clearPlan }
}

function restoreTrip(): Trip {
  const saved = load<Trip>(local, TRIP_KEY)
  const fresh = emptyTrip()
  if (!saved?.origin?.place || !saved.destination?.place) return fresh
  // Yesterday's departure time is no use today.
  return { ...fresh, ...saved, depart: nextHalfHour(Date.now(), departureZone(saved.origin.place)) }
}

async function matchPlaces(trip: Trip, departTouched: boolean): Promise<{ trip: Trip; errors: TripErrors }> {
  const errors: TripErrors = {}
  const match = async (field: 'origin' | 'destination'): Promise<Place | null> => {
    const { text, place } = trip[field]
    if (place) return place
    const places = await searchPlaces(text)
    const match = matchPlace(text, places)
    if (places.length === 0) errors[field] = `No place found for "${text.trim()}".`
    else if (!match) errors[field] = 'More than one place matches. Pick one from the list.'
    return match
  }
  const [origin, destination] = await Promise.all([match('origin'), match('destination')])
  const filled = { ...trip }
  if (origin) filled.origin = { text: origin.label, place: origin }
  if (destination) filled.destination = { text: destination.label, place: destination }
  if (origin && !trip.origin.place && !departTouched) filled.depart = nextHalfHour(Date.now(), departureZone(origin))
  return { trip: filled, errors }
}
