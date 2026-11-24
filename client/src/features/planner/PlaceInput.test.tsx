import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { PlaceValue } from '../../domain/trip'
import { renderWithQuery, stubApi } from '../../test/render'
import { PlaceInput } from './PlaceInput'

const DALLAS = { label: 'Dallas, TX, United States', lat: 32.78, lng: -96.8 }
const DALLAS_OR = { label: 'Dallas, OR, United States', lat: 44.92, lng: -123.3 }

function setup(error?: string) {
  const onChange = vi.fn()
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
  function Harness() {
    const [value, setValue] = useState<PlaceValue>({ text: '', place: null })
    return (
      <form onSubmit={onSubmit}>
        <PlaceInput label="From" value={value} error={error} onChange={(v) => { onChange(v); setValue(v) }} />
      </form>
    )
  }
  renderWithQuery(<Harness />)
  return { onChange, onSubmit, input: screen.getByRole('combobox', { name: 'From' }), user: userEvent.setup() }
}

describe('PlaceInput', () => {
  it('searches once typing pauses and fills in the picked place', async () => {
    const fetch = stubApi({ '/api/geocode/': () => ({ body: [DALLAS, DALLAS_OR] }) })
    const { input, user, onChange } = setup()
    await user.type(input, 'dallas')
    await user.click(await screen.findByRole('option', { name: 'Dallas, TX' }))
    expect(onChange).toHaveBeenLastCalledWith({ text: 'Dallas, TX', place: DALLAS })
    expect(input).toHaveValue('Dallas, TX')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('picks with the keyboard without submitting the form', async () => {
    stubApi({ '/api/geocode/': () => ({ body: [DALLAS, DALLAS_OR] }) })
    const { input, user, onChange, onSubmit } = setup()
    await user.type(input, 'dallas')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Dallas, OR' })).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Dallas, OR' }).id)
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith({ text: 'Dallas, OR', place: DALLAS_OR })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('forgets the picked place once its text is edited', async () => {
    stubApi({ '/api/geocode/': () => ({ body: [DALLAS] }) })
    const { input, user, onChange } = setup()
    await user.type(input, 'dallas')
    await user.click(await screen.findByRole('option', { name: 'Dallas, TX' }))
    await user.type(input, 'x')
    expect(onChange).toHaveBeenLastCalledWith({ text: 'Dallas, TXx', place: null })
  })

  it('closes on Escape and stays closed until typing again', async () => {
    stubApi({ '/api/geocode/': () => ({ body: [DALLAS] }) })
    const { input, user } = setup()
    await user.type(input, 'dallas')
    await screen.findByRole('listbox')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('dallas')
  })

  it('says when nothing matches', async () => {
    stubApi({ '/api/geocode/': () => ({ body: [] }) })
    const { input, user } = setup()
    await user.type(input, 'qqzzxx')
    expect(await screen.findByText('No places match. Try a city and state.')).toBeInTheDocument()
  })

  it('says why search failed', async () => {
    stubApi({ '/api/geocode/': () => ({ status: 502, body: { detail: 'HERE Geocoding timed out.' } }) })
    const { input, user } = setup()
    await user.type(input, 'dallas')
    expect(await screen.findByText('HERE Geocoding timed out.')).toBeInTheDocument()
  })

  it('does not search below three characters', async () => {
    const fetch = stubApi({})
    const { input, user } = setup()
    await user.type(input, 'da')
    await new Promise((r) => setTimeout(r, 350))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ties an error to the input', async () => {
    const { input } = setup('Enter where the trip starts.')
    expect(input).toBeInvalid()
    await waitFor(() => expect(input).toHaveAccessibleDescription('Enter where the trip starts.'))
  })
})
