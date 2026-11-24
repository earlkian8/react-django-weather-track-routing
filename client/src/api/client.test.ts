import { describe, expect, it, vi } from 'vitest'
import { ApiError, createPlan, fetchHeatmap, searchPlaces } from './client'

function stubFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetch = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(() => null, (e) => e)
  expect(error).toBeInstanceOf(ApiError)
  return error
}

const REQUEST = {
  origin: 'Dallas',
  destination: 'Denver',
  departure_time: '2026-11-24T14:00:00Z',
  load_weight_lb: 1,
  checkpoint_interval_mi: 25,
}

describe('requests', () => {
  it('posts a plan as JSON', async () => {
    const fetch = stubFetch(200, { id: 'x' })
    expect(await createPlan(REQUEST)).toEqual({ id: 'x' })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/plans/')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(REQUEST)
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
  })

  it('encodes the place search and passes the abort signal on', async () => {
    const fetch = stubFetch(200, [])
    const { signal } = new AbortController()
    await searchPlaces('St. Louis & East', signal)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/geocode/?q=St.%20Louis%20%26%20East')
    expect(init.signal).toBe(signal)
  })

  it('does not search for fewer than three characters, as the API returns nothing', async () => {
    const fetch = stubFetch(200, [])
    expect(await searchPlaces(' ab ')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('gets a heatmap by plan', async () => {
    const fetch = stubFetch(200, { hours: 49 })
    await fetchHeatmap('abc')
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('/api/plans/abc/heatmap/')
  })
})

describe('failures', () => {
  it('reads field errors', async () => {
    stubFetch(400, { load_weight_lb: ['Ensure this value is less than or equal to 80000.'] })
    const e = await failure(createPlan(REQUEST))
    expect(e.status).toBe(400)
    expect(e.fields).toEqual({ load_weight_lb: 'Ensure this value is less than or equal to 80000.' })
  })

  it('reads nested place errors', async () => {
    stubFetch(400, { origin: { lat: ['A valid number is required.'] } })
    expect((await failure(createPlan(REQUEST))).fields).toEqual({ origin: 'A valid number is required.' })
  })

  it('uses a non-field error as the message', async () => {
    stubFetch(400, { non_field_errors: ['No truck route found between these places.'] })
    const e = await failure(createPlan(REQUEST))
    expect(e.message).toBe('No truck route found between these places.')
    expect(e.fields).toEqual({})
  })

  it('uses detail as the message', async () => {
    stubFetch(502, { detail: 'Open-Meteo returned HTTP 429' })
    expect((await failure(fetchHeatmap('x'))).message).toBe('Open-Meteo returned HTTP 429')
  })

  it('says how long to wait when rate limited', async () => {
    stubFetch(429, { detail: 'Request was throttled.' }, { 'Retry-After': '17' })
    expect((await failure(createPlan(REQUEST))).message).toBe('Too many requests. Try again in 17 seconds.')
  })

  it('explains an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const e = await failure(createPlan(REQUEST))
    expect(e.status).toBe(0)
    expect(e.message).toBe("Can't reach the planning server. Check that it's running, then try again.")
  })

  it('explains an error page that is not JSON', async () => {
    stubFetch(500, '<h1>Server Error</h1>')
    expect((await failure(createPlan(REQUEST))).message).toBe('The planning server failed (HTTP 500). Try again in a moment.')
  })

  it('treats the empty error a dev proxy sends for a stopped server as unreachable', async () => {
    stubFetch(502, '')
    expect((await failure(createPlan(REQUEST))).message).toContain("Can't reach the planning server")
  })

  it('lets an abort through untouched', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(abort)))
    await expect(searchPlaces('dallas')).rejects.toBe(abort)
  })
})
