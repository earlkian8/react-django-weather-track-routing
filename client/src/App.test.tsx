import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeHeatmap, makePlan } from './test/fixtures'
import { renderWithQuery, stubApi } from './test/render'

vi.mock('./features/map/RouteMap', () => ({ default: () => <div data-testid="map" /> }))

const AMARILLO = { label: 'Amarillo, TX, United States', lat: 35.2, lng: -101.83 }
const DENVER = { label: 'Denver, CO, United States', lat: 39.74, lng: -104.99 }

const geocode = (url: URL) => ({ body: /denver/i.test(url.searchParams.get('q')!) ? [DENVER] : [AMARILLO] })

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-11-24T11:40:00Z'), shouldAdvanceTime: true, toFake: ['Date'] })
  return () => void vi.useRealTimers()
})

async function fillIn(user = userEvent.setup()) {
  await user.type(screen.getByRole('combobox', { name: 'From' }), 'amarillo')
  await user.click(await screen.findByRole('option', { name: 'Amarillo, TX, United States' }))
  await user.type(screen.getByRole('combobox', { name: 'To' }), 'denver')
  await user.click(await screen.findByRole('option', { name: 'Denver, CO, United States' }))
  await user.type(screen.getByLabelText('Load weight in pounds'), '42000')
  return user
}

const planButton = () => screen.getByRole('button', { name: 'Plan trip' })

describe('planning a trip', () => {
  it('sends the trip and shows the recommended route', async () => {
    const fetch = stubApi({ '/api/geocode/': geocode, '/api/plans/': () => ({ body: makePlan() }) })
    renderWithQuery(<App />)
    const user = await fillIn()
    await user.click(screen.getByRole('radio', { name: '50 miles' }))
    await user.click(planButton())

    expect(await screen.findByRole('heading', { name: /Take Route A/ })).toBeInTheDocument()
    expect(screen.getByText('Shortest duration: 2 h vs 2 h 10 min on Route B.')).toBeInTheDocument()
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/plans/')!
    expect(JSON.parse(init!.body as string)).toEqual({
      origin: AMARILLO,
      destination: DENVER,
      departure_time: '2026-11-24T12:00:00.000Z', // the next half hour, 6:00 AM in Amarillo
      load_weight_lb: 42_000,
      checkpoint_interval_mi: 50,
    })
  })

  it('shows departure in the origin time zone', async () => {
    stubApi({ '/api/geocode/': geocode })
    renderWithQuery(<App />)
    await fillIn()
    expect(screen.getByLabelText(/Leaves/)).toHaveValue('2026-11-24T06:00')
    expect(screen.getByText(/Amarillo time, CST/)).toBeInTheDocument()
  })

  it('matches typed places that were never picked', async () => {
    const fetch = stubApi({ '/api/geocode/': geocode, '/api/plans/': () => ({ body: makePlan() }) })
    renderWithQuery(<App />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox', { name: 'From' }), 'amarillo')
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'denver')
    await user.type(screen.getByLabelText('Load weight in pounds'), '0')
    await user.click(planButton())
    await screen.findByRole('heading', { name: /Take Route A/ })
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/plans/')!
    expect(JSON.parse(init!.body as string)).toMatchObject({ origin: AMARILLO, destination: DENVER })
  })

  it('asks which place is meant rather than guessing', async () => {
    const paris = [
      { label: 'Paris, Île-de-France, France', lat: 48.86, lng: 2.35 },
      { label: 'Paris, TX, United States', lat: 33.66, lng: -95.56 },
    ]
    const fetch = stubApi({ '/api/geocode/': () => ({ body: paris }) })
    renderWithQuery(<App />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox', { name: 'From' }), 'paris')
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'paris, tx')
    await user.type(screen.getByLabelText('Load weight in pounds'), '0')
    await user.click(planButton())
    expect(await screen.findByText('More than one place matches. Pick one from the list.')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Paris, Île-de-France, France' })).toBeInTheDocument()
    expect(fetch.mock.calls.some(([url]) => url === '/api/plans/')).toBe(false)
  })

  it('notes the US gross limit only for trips from the US, and gives kilograms elsewhere', async () => {
    const manila = { label: 'Manila, National Capital Region, Philippines', lat: 14.6, lng: 120.98 }
    stubApi({ '/api/geocode/': (url) => ({ body: /manila/i.test(url.searchParams.get('q')!) ? [manila] : [AMARILLO] }) })
    renderWithQuery(<App />)
    const user = userEvent.setup()
    const from = screen.getByRole('combobox', { name: 'From' })
    await user.type(screen.getByLabelText('Load weight in pounds'), '50000')
    await user.type(from, 'amarillo')
    await user.click(await screen.findByRole('option', { name: AMARILLO.label }))
    expect(screen.getByText('85,000 lb gross, over the usual US 80,000')).toBeInTheDocument()
    await user.clear(from)
    await user.type(from, 'manila')
    await user.click(await screen.findByRole('option', { name: manila.label }))
    expect(screen.getByText('22,680 kg load, 38,555 kg gross with the truck')).toBeInTheDocument()
    expect(screen.getByText(/Manila time, GMT\+8/)).toBeInTheDocument()
  })

  it('points at each missing field and moves focus to the first', async () => {
    const fetch = stubApi({})
    renderWithQuery(<App />)
    await userEvent.setup().click(planButton())
    expect(screen.getByText('Enter where the trip starts.')).toBeInTheDocument()
    expect(screen.getByText('Enter the load weight, or 0 if empty.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'From' })).toHaveFocus())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports a typed place that does not exist', async () => {
    stubApi({ '/api/geocode/': () => ({ body: [] }) })
    renderWithQuery(<App />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox', { name: 'From' }), 'qqzzxx')
    await user.type(screen.getByRole('combobox', { name: 'To' }), 'denver')
    await user.type(screen.getByLabelText('Load weight in pounds'), '0')
    await user.click(planButton())
    expect(await screen.findByText('No place found for "qqzzxx".')).toBeInTheDocument()
  })

  it('shows API errors on the fields they belong to', async () => {
    stubApi({
      '/api/geocode/': geocode,
      '/api/plans/': () => ({ status: 400, body: { departure_time: ['Must be between 1 hour ago and 7 days from now.'] } }),
    })
    renderWithQuery(<App />)
    const user = await fillIn()
    await user.click(planButton())
    expect(await screen.findByText('Must be between 1 hour ago and 7 days from now.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Leaves/)).toBeInvalid()
  })

  it('shows upstream failures and can try again', async () => {
    let calls = 0
    stubApi({
      '/api/geocode/': geocode,
      '/api/plans/': () =>
        ++calls === 1 ? { status: 502, body: { detail: 'Open-Meteo returned HTTP 503' } } : { body: makePlan() },
    })
    renderWithQuery(<App />)
    const user = await fillIn()
    await user.click(planButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Open-Meteo returned HTTP 503')
    await user.click(planButton())
    expect(await screen.findByRole('heading', { name: /Take Route A/ })).toBeInTheDocument()
  })

  it('cannot be sent twice', async () => {
    let finish = () => {}
    const fetch = stubApi({
      '/api/geocode/': geocode,
      '/api/plans/': () => new Promise((resolve) => (finish = () => resolve({ body: makePlan() }))),
    })
    renderWithQuery(<App />)
    const user = await fillIn()
    await user.click(planButton())
    const busy = await screen.findByRole('button', { name: /Checking roads and weather/ })
    await user.click(busy)
    await act(async () => finish())
    await screen.findByRole('heading', { name: /Take Route A/ })
    expect(fetch.mock.calls.filter(([url]) => url === '/api/plans/')).toHaveLength(1)
  })
})

describe('results', () => {
  async function plan(body = makePlan()) {
    stubApi({
      '/api/geocode/': geocode,
      '/api/plans/': () => ({ body }),
      [`/api/plans/${body.id}/heatmap/`]: () => ({ body: makeHeatmap() }),
    })
    renderWithQuery(<App />)
    const user = await fillIn()
    await user.click(planButton())
    await screen.findByRole('heading', { name: /^(Take|Best available:) Route A$/ })
    return user
  }

  it('moves focus to the recommendation, for screen readers', async () => {
    await plan()
    expect(screen.getByRole('heading', { name: 'Take Route A' })).toHaveFocus()
    expect(document.title).toBe('Amarillo to Tucumcari: Crosswind')
  })

  it('compares routes and follows the one selected', async () => {
    const user = await plan()
    const routes = screen.getByRole('radiogroup', { name: 'Routes' })
    expect(within(routes).getByRole('radio', { name: /Route A/ })).toBeChecked()
    expect(within(routes).getByText(/25 mi Severe, 25 mi High, 25 mi Moderate, 13 mi without a forecast/)).toBeInTheDocument()

    await user.click(within(routes).getByRole('radio', { name: /Route B/ }))
    const log = screen.getByRole('table', { name: /Route B/ })
    expect(within(log).getByText('Severe')).toBeInTheDocument()
    expect(within(log).getByText('No forecast')).toBeInTheDocument()
  })

  it('says how much of a route is by ferry', async () => {
    const body = makePlan()
    body.routes[0].ferry_mi = 487.2
    await plan(body)
    expect(screen.getByText('487 mi of Route A is by ferry. Its risk uses the same rules as the road.')).toBeInTheDocument()
    const routes = screen.getByRole('radiogroup', { name: 'Routes' })
    expect(within(routes).getAllByText(/by ferry/)).toHaveLength(1)
  })

  it('shows the advisory when every route has No Travel miles', async () => {
    await plan(makePlan({ advisory: 'Every route crosses No Travel conditions. Consider delaying departure.' }))
    expect(screen.getByRole('heading', { name: 'Best available: Route A' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Every route crosses No Travel conditions.')
  })

  it('moves the truck to a checkpoint picked in the log', async () => {
    const user = await plan()
    const log = screen.getByRole('table', { name: /Route A/ })
    await user.click(within(log).getByRole('button', { name: /mile 50/i }))
    const slider = screen.getByRole('slider', { name: 'Position along the route' })
    await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '50'))
  })

  it('drives with the arrow keys, one checkpoint at a time', async () => {
    const user = await plan()
    const slider = screen.getByRole('slider', { name: 'Position along the route' })
    act(() => slider.focus())
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(slider).toHaveAttribute('aria-valuenow', '50')
    await user.keyboard('{ArrowLeft}')
    expect(slider).toHaveAttribute('aria-valuenow', '25')
    await user.keyboard('{End}')
    expect(slider).toHaveAttribute('aria-valuenow', '100')
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringMatching(/Mile 100, .* Low/))
    await user.keyboard('{Home}')
    expect(slider).toHaveAttribute('aria-valuenow', '0')
  })

  it('goes back to change the trip with the form still filled in', async () => {
    const user = await plan()
    await user.click(screen.getByRole('button', { name: 'Change trip' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'From' })).toHaveValue('Amarillo, TX, United States'))
    expect(screen.getByLabelText('Load weight in pounds')).toHaveValue('42,000')
  })

  it('survives a reload without asking the API again', async () => {
    await plan()
    document.body.innerHTML = ''
    const fetch = stubApi({})
    renderWithQuery(<App />)
    expect(await screen.findByRole('heading', { name: /Take Route A/ })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})
