import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'

export function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

type Reply = { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>
type Handler = (url: URL, init?: RequestInit) => Reply

/** Answers fetches by path prefix; anything else fails the test. */
export function stubApi(handlers: Record<string, Handler>) {
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://test')
    const path = Object.keys(handlers).sort((a, b) => b.length - a.length).find((p) => url.pathname.startsWith(p))
    if (!path) throw new Error(`Unexpected request: ${input}`)
    const { status = 200, body } = await handlers[path](url, init)
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
