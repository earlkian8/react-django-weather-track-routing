import { ArrowLeftRight, MoveRight, TriangleAlert } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useId, useRef, type FormEvent } from 'react'
import { Scene } from '../../art/Scene'
import { Truss } from '../../art/Truss'
import { isInUS, placeName } from '../../domain/place'
import { zoneAbbr, zonedToUtc, toZonedInput } from '../../domain/time'
import { departureZone, formatLoad, INTERVALS, parseLoad, type Trip, type TripErrors } from '../../domain/trip'
import { PlaceInput } from './PlaceInput'
import styles from './Planner.module.css'

/** Mirrors TRUCK_TARE_LB in the API settings. */
const TRUCK_TARE_LB = 35_000
const US_GROSS_LIMIT_LB = 80_000
const KG_PER_LB = 0.45359237

const EXAMPLE: Partial<Trip> = {
  origin: { text: 'Dallas, TX, United States', place: { label: 'Dallas, TX, United States', lat: 32.77823, lng: -96.7951 } },
  destination: { text: 'Denver, CO, United States', place: { label: 'Denver, CO, United States', lat: 39.74001, lng: -104.99202 } },
  load: '42,000',
}

const DAY_MS = 86_400_000

interface Props {
  trip: Trip
  errors: TripErrors
  pending: boolean
  onChange: (patch: Partial<Trip>) => void
  onSubmit: () => Promise<TripErrors>
}

export function Planner({ trip, errors, pending, onChange, onSubmit }: Props) {
  const still = useReducedMotion()
  const form = useRef<HTMLFormElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const problems = await onSubmit()
    if (Object.keys(problems).length > 0) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
    }
  }

  return (
    <motion.main
      className={styles.planner}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45, delay: still ? 0 : 0.15 } }}
    >
      <Scene driving={pending} />
      <motion.form
        ref={form}
        className={styles.form}
        onSubmit={submit}
        noValidate
        aria-label="Trip"
        // Driving under the gantry.
        exit={still ? { opacity: 0 } : { scale: 1.7, y: '-70%', opacity: 0, transition: { duration: 0.6, ease: [0.5, 0, 0.8, 0.4] } }}
      >
        <div className={styles.gantry}>
          <span className={styles.legs} aria-hidden />
          <Truss className={styles.truss} />
          <div className={styles.signs}>
            <div className={styles.sign}>
              <PlaceInput
                label="From"
                placeholder="City or address"
                value={trip.origin}
                error={errors.origin}
                onChange={(origin) => onChange({ origin })}
              />
            </div>
            <button
              type="button"
              className={styles.swap}
              aria-label="Swap start and destination"
              title="Swap start and destination"
              onClick={() => onChange({ origin: trip.destination, destination: trip.origin })}
            >
              <ArrowLeftRight size={20} aria-hidden />
            </button>
            <div className={styles.sign}>
              <PlaceInput
                label="To"
                placeholder="City or address"
                value={trip.destination}
                error={errors.destination}
                onChange={(destination) => onChange({ destination })}
              />
            </div>
          </div>
        </div>

        <div className={styles.plates}>
          <Departure trip={trip} error={errors.depart} onChange={onChange} />
          <Load trip={trip} error={errors.load} onChange={onChange} />
          <Interval trip={trip} onChange={onChange} />
        </div>

        <div className={styles.go}>
          {!trip.origin.text && !trip.destination.text && !errors.form && (
            <button type="button" className={styles.example} onClick={() => onChange(EXAMPLE)}>
              Try Dallas <MoveRight size={18} aria-label="to" /> Denver
            </button>
          )}
          {errors.form && (
            <p role="alert" className={styles.alert}>
              <TriangleAlert size={18} aria-hidden /> {errors.form}
            </p>
          )}
          <button type="submit" className={styles.submit} aria-disabled={pending}>
            {pending ? 'Checking roads and weather…' : 'Plan trip'}
          </button>
        </div>
      </motion.form>
    </motion.main>
  )
}

interface FieldProps {
  trip: Trip
  error?: string
  onChange: (patch: Partial<Trip>) => void
}

/** A variable message sign. */
function Departure({ trip, error, onChange }: FieldProps) {
  const id = useId()
  const zone = departureZone(trip.origin.place)
  const when = zonedToUtc(trip.depart, zone).getTime()
  const now = new Date()
  const abbreviation = Number.isNaN(when) ? '' : zoneAbbr(when, zone)
  const where = trip.origin.place ? `${placeName(trip.origin.text)} time` : 'Your time'
  return (
    <div className={styles.board}>
      <label htmlFor={id} className={styles.boardLabel}>
        Leaves
      </label>
      <div className={styles.leds}>
        <input
          id={id}
          type="datetime-local"
          value={trip.depart}
          min={toZonedInput(now, zone)}
          max={toZonedInput(new Date(now.getTime() + 7 * DAY_MS), zone)}
          aria-invalid={!!error}
          aria-describedby={`${id}-note`}
          onChange={(e) => onChange({ depart: e.target.value })}
        />
      </div>
      <p id={`${id}-note`} className={error ? styles.boardError : styles.boardNote}>
        {error ?? `${where}${abbreviation && `, ${abbreviation}`}`}
      </p>
    </div>
  )
}

/** A white regulatory sign. */
function Load({ trip, error, onChange }: FieldProps) {
  const id = useId()
  const load = parseLoad(trip.load)
  const gross = (load ?? 0) + TRUCK_TARE_LB
  const { place } = trip.origin
  const kg = (pounds: number) => `${Math.round(pounds * KG_PER_LB).toLocaleString('en-US')} kg`
  const note =
    load === null ? 'Enter 0 if empty'
    : place && !isInUS(place) ? `${kg(load)} load, ${kg(gross)} gross with the truck`
    : place && gross > US_GROSS_LIMIT_LB ? `${gross.toLocaleString('en-US')} lb gross, over the usual US 80,000`
    : `${gross.toLocaleString('en-US')} lb gross with the truck`
  return (
    <div className={styles.regulatory}>
      <label htmlFor={id}>
        Load weight<span className="visually-hidden"> in pounds</span>
      </label>
      <div className={styles.weight}>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={trip.load}
          aria-invalid={!!error}
          aria-describedby={`${id}-note`}
          onChange={(e) => onChange({ load: formatLoad(e.target.value) })}
        />
        <span aria-hidden>lb</span>
      </div>
      <p id={`${id}-note`} className={error ? styles.regulatoryError : undefined}>{error ?? note}</p>
    </div>
  )
}

/** Mile marker plates. */
function Interval({ trip, onChange }: FieldProps) {
  return (
    <fieldset className={styles.interval}>
      <legend>Check weather every</legend>
      <div className={styles.markers}>
        {INTERVALS.map((miles) => (
          <label key={miles} className={styles.marker}>
            <input
              type="radio"
              name="interval"
              className="visually-hidden"
              checked={trip.interval === miles}
              onChange={() => onChange({ interval: miles })}
            />
            <span className={styles.plate}>
              {miles} <small>miles</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
