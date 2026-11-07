/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App.jsx'

const cards = [
  { id: 'card_tools', activity: 'Building useful tools', interest_tags: ['technology', 'problem_solving'] },
  { id: 'card_learners', activity: 'Helping learners grow', interest_tags: ['education'] },
]

const matches = [{
  career_id: 'career_software_developer',
  title: 'Software Developer',
  rationale: 'Shared liked tags: technology.',
  matched_interest_tags: ['technology', 'problem_solving'],
  interest_score: 80,
}]

const career = {
  career_id: 'career_software_developer',
  title: 'Software Developer',
  summary: 'Software developers design, build, test, and maintain software applications and systems.',
  requirements: ['Knowledge of programming languages', 'Problem-solving and analytical skills'],
  sources: [{ title: 'BLS Occupational Outlook Handbook', url: 'https://example.org/career', verification_status: 'unverified', verified_at: null }],
  mdc_resources: [],
  external_resources: [],
}

let fetchMock

beforeEach(() => {
  fetchMock = vi.fn(async (url, options = {}) => {
    let body
    if (url.endsWith('/api/cards')) body = { cards }
    else if (url.endsWith('/api/matches')) body = { status: 'ready', matches, score_description: 'Interest alignment only.' }
    else if (url.endsWith('/api/careers/career_software_developer')) body = career
    else return { ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) }
    return { ok: true, status: 200, json: async () => body }
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function enterDemoCredentials() {
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'student@mdc.edu' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'MDC2026' },
  })
  fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
}

async function reachBubbleExplorer() {
  enterDemoCredentials()
  await screen.findByText('Building useful tools')
  fireEvent.click(screen.getByRole('button', { name: 'Agree' }))
  await screen.findByText('Helping learners grow')
  fireEvent.click(screen.getByRole('button', { name: 'Disagree' }))
  await screen.findByRole('button', { name: 'Software Developer' })
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/careers/career_software_developer'), expect.any(Object),
  ))
}

describe('Login → backend swipe cards → Bubble Explorer', () => {
  it('shows the agreed error for incorrect demo credentials', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'wrong@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))

    expect(screen.getByRole('alert').textContent).toBe(
      'Invalid Username or Password. Please Try Again!',
    )
  })

  it('loads actual swipe cards and matches, with search in the top header', async () => {
    render(<App />)
    await reachBubbleExplorer()
    expect(screen.getByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    expect(screen.getByLabelText('Search careers, fields, or pathways...')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Software Developer' })).toBeTruthy()
    expect(screen.queryByText(/ORQUEST ORBIT/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Toggle technology' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle problem solving' })).toBeTruthy()

    const technologyFilter = screen.getByRole('button', { name: 'Toggle technology' })
    fireEvent.click(technologyFilter)
    expect(technologyFilter.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Software Developer' }).className).toContain('is-muted')
    fireEvent.click(technologyFilter)
    expect(technologyFilter.getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(screen.getByLabelText('Search careers, fields, or pathways...'), { target: { value: 'developer' } })
    expect(screen.getByRole('button', { name: 'Software Developer' }).className).toContain('is-search-match')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByLabelText('Search careers, fields, or pathways...').value).toBe('')
  })

  it('opens a backend summary on single-click and closes it', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    expect(await screen.findByText(career.summary)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Software Developer' })).toBeTruthy()
    expect(screen.getByLabelText('Ask a question about this career')).toBeTruthy()

    const requestCount = fetchMock.mock.calls.length
    fireEvent.change(screen.getByLabelText('Ask a question about this career'), { target: { value: 'What should I learn?' } })
    expect(fetchMock).toHaveBeenCalledTimes(requestCount)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/ai'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Close career summary' }))
    expect(screen.queryByText(career.summary)).toBeNull()
  })

  it('opens details on bubble or summary double-click and returns to the summary', async () => {
    render(<App />)
    await reachBubbleExplorer()
    const careerBubble = screen.getByRole('button', { name: 'Software Developer' })
    fireEvent.click(careerBubble)
    fireEvent.click(careerBubble)
    fireEvent.doubleClick(careerBubble)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(document.querySelector('.map-summary')).toBeNull()
    expect(screen.getByText('Knowledge of programming languages')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Career description' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to summary' }))
    expect(screen.getByText(career.summary)).toBeTruthy()

    fireEvent.doubleClick(screen.getByText(career.summary))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close career details' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('collapses and restores the Field Guide', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Field Guide' }))
    expect(screen.getByRole('button', { name: 'Expand Field Guide' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Field Guide' }))
    expect(screen.getByRole('button', { name: 'Collapse Field Guide' })).toBeTruthy()
  })

  it('shows a backend-unavailable state instead of demo cards', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    render(<App />)
    enterDemoCredentials()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('SWIPE CARDS ARE UNAVAILABLE')).toBeTruthy()
    expect(screen.queryByText('Solving puzzles and hunting down bugs in code')).toBeNull()
  })
})
