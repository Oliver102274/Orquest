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
    expect(screen.getByRole('heading', { name: 'External resources' })).toBeTruthy()
    expect(screen.getByText('TryHackMe Pre Security Learning Path')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Ask a question about this career'), { target: { value: 'How do I begin?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))
    expect(await screen.findByText('Career AI chat is not connected yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send question unavailable' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse career chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    await screen.findByRole('heading', { name: 'A little more about you.' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(await screen.findByRole('heading', { name: 'Your journey begins.' })).toBeTruthy()
    expect(document.querySelector('.rpg-card .journey-path-card strong').textContent).toBe('Cybersecurity Analyst')
    expect(screen.getByText('Quest progress and rewards are not active yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /return to bubble explorer/i }))
    expect(await screen.findByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
  } finally {
    cleanup()
    vi.unstubAllGlobals()
  }
}, 20000)
