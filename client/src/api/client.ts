import type { Heatmap, Place, Plan, PlanRequest } from './types'

export const MIN_SEARCH_LENGTH = 3

const BASE = import.meta.env.VITE_API_BASE ?? ''
const UNREACHABLE = "Can't reach the planning server. Check that it's running, then try again."

/** A failed API call. `status` is 0 when no response arrived. */
export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

export function createPlan(plan: PlanRequest): Promise<Plan> {
  return request('/api/plans/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan),
  })
}

export function fetchHeatmap(planId: string, signal?: AbortSignal): Promise<Heatmap> {
  return request(`/api/plans/${planId}/heatmap/`, { signal })
}

export async function searchPlaces(text: string, signal?: AbortSignal): Promise<Place[]> {
  const query = text.trim()
  if (query.length < MIN_SEARCH_LENGTH) return []
  return request(`/api/geocode/?q=${encodeURIComponent(query)}`, { signal })
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(BASE + path, init)
  } catch (error) {
    if (init.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new ApiError(0, UNREACHABLE)
  }
  const text = await response.text()
  if (response.ok) return JSON.parse(text)
  throw toError(response, text)
}

function toError(response: Response, text: string): ApiError {
  const { status } = response
  // A dev proxy answers with an empty 5xx when Django isn't running.
  if (status >= 500 && text === '') return new ApiError(0, UNREACHABLE)

  if (status === 429) {
    const seconds = response.headers.get('Retry-After')
    return new ApiError(status, `Too many requests. Try again in ${seconds ? `${seconds} seconds` : 'a minute'}.`)
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(text)
  } catch {
    return new ApiError(status, `The planning server failed (HTTP ${status}). Try again in a moment.`)
  }

  const { detail, non_field_errors, ...rest } = body
  const fields = Object.fromEntries(Object.entries(rest).map(([name, value]) => [name, firstMessage(value)]))
  const message = firstMessage(detail ?? non_field_errors) || 'Some of the trip details need another look.'
  return new ApiError(status, message, fields)
}

/** DRF nests messages in lists, and in objects for nested fields. */
function firstMessage(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return firstMessage(Object.values(value)[0])
  return ''
}
