import { useQuery } from '@tanstack/react-query'
import { LoaderCircle, MapPin } from 'lucide-react'
import { useId, useState, type KeyboardEvent, type Ref } from 'react'
import { MIN_SEARCH_LENGTH, searchPlaces } from '../../api/client'
import type { Place } from '../../api/types'
import { placeName } from '../../domain/place'
import type { PlaceValue } from '../../domain/trip'
import { useDebounced } from '../../state/useDebounced'
import styles from './PlaceInput.module.css'

const SEARCH_DELAY_MS = 250
const STALE_MS = 10 * 60_000

interface Props {
  label: string
  value: PlaceValue
  error?: string
  placeholder?: string
  inputRef?: Ref<HTMLInputElement>
  onChange: (value: PlaceValue) => void
}

/** A place box lettered like a guide sign, with suggestions as you type. */
export function PlaceInput({ label, value, error, placeholder, inputRef, onChange }: Props) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const text = value.place ? '' : value.text.trim()
  const query = useDebounced(text, SEARCH_DELAY_MS)
  const ready = query.length >= MIN_SEARCH_LENGTH && query === text
  const search = useQuery({
    queryKey: ['places', query.toLowerCase()],
    queryFn: ({ signal }) => searchPlaces(query, signal),
    enabled: ready,
    staleTime: STALE_MS,
    retry: false,
  })

  const places = ready ? search.data : undefined
  const showList = open && !!places && places.length > 0
  const message =
    !open || !ready ? null
    : search.isError ? search.error.message
    : places?.length === 0 ? 'No places match. Try a city and country.'
    : null
  const searching = open && text.length >= MIN_SEARCH_LENGTH && !places && !search.isError

  function pick(place: Place) {
    onChange({ text: place.label, place })
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!showList) {
      if (event.key !== 'ArrowDown' || !places?.length) return
      event.preventDefault()
      return setOpen(true)
    }
    const last = places.length - 1
    if (event.key === 'ArrowDown') setActive((i) => (i >= last ? 0 : i + 1))
    else if (event.key === 'ArrowUp') setActive((i) => (i <= 0 ? last : i - 1))
    else if (event.key === 'Enter' && active >= 0) pick(places[active])
    else if (event.key === 'Escape') setOpen(false)
    else return
    event.preventDefault()
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.entry}>
        <input
          ref={inputRef}
          id={id}
          className={styles.input}
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-${active}` : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value.text}
          onChange={(e) => {
            onChange({ text: e.target.value, place: null })
            setOpen(true)
            setActive(-1)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        />
        {searching && <LoaderCircle className={styles.spinner} size={20} aria-hidden />}
      </div>
      {error && <p id={`${id}-error`} className={styles.error}>{error}</p>}

      {showList && (
        <ul id={`${id}-list`} role="listbox" aria-label={`Places for ${label}`} className={styles.list}>
          {places.map((place, i) => {
            const name = placeName(place.label)
            return (
              <li
                key={place.label + place.lat + place.lng}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                aria-label={place.label}
                className={styles.option}
                // Keeps focus in the input, so blur doesn't close the list before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(place)}
              >
                <MapPin size={16} aria-hidden />
                <span>
                  <strong>{name}</strong>
                  {place.label.slice(name.length)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {message && <p className={styles.message} role="status">{message}</p>}
    </div>
  )
}
