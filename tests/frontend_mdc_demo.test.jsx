/** @vitest-environment jsdom */
// Copied temporarily into the isolated frontend worktree by the Python runner.
import React from 'react'
import { it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './src/App.jsx'

it('loads the local eight-question bank without using legacy card or matching endpoints', async () => {
  const realFetch = globalThis.fetch
  const base = process.env.INTEGRATION_API_BASE
  const requests = []
  vi.stubGlobal('fetch', async (url, options = {}) => {
    const path = new URL(url).pathname
    requests.push({ path, method: options.method || 'GET' })
    return realFetch(base + path, options)
  })
  try {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student@mdc.edu' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'MDC2026' } })
    fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
    expect(await screen.findByRole('heading', { name: /which option best describes your education right now/i })).toBeTruthy()
    expect(screen.getByText(/MAIN QUESTION 1 OF 8/i)).toBeTruthy()
    expect(requests.some(request => request.path === '/api/cards')).toBe(false)
    expect(requests.some(request => request.path === '/api/matches')).toBe(false)
  } finally {
    cleanup()
    vi.unstubAllGlobals()
  }
}, 30000)
