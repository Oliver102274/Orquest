/** @vitest-environment jsdom */
// Copied temporarily into the isolated frontend worktree by the Python runner.
import React from 'react'
import { it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './src/App.jsx'

it('displays the MDC program from the live local backend after swiping', async () => {
  const realFetch = globalThis.fetch
  const base = process.env.INTEGRATION_API_BASE
  const cards = (await (await realFetch(base + '/api/cards')).json()).cards
  vi.stubGlobal('fetch', (url, options) => realFetch(base + new URL(url).pathname, options))
  try {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student@mdc.edu' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'MDC2026' } })
    fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
    for (const card of cards) {
      await screen.findByText(card.activity)
      fireEvent.click(screen.getByRole('button', { name: 'Agree' }))
    }
    const bubble = await screen.findByRole('button', { name: 'Cybersecurity Analyst' })
    fireEvent.doubleClick(bubble)
    await screen.findByRole('dialog')
    expect(await screen.findByText(/Cybersecurity — Associate in Science: 60 credits/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'MDC resources' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Open source' }).some(link => link.href === 'https://www.mdc.edu/cybersecurityas/')).toBe(true)
  } finally {
    cleanup()
    vi.unstubAllGlobals()
  }
}, 20000)
