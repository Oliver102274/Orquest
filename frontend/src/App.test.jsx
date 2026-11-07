/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import App from './App.jsx'
import {
  grantQuizPersonalizationConsent,
  initialPersonalizationConsents,
  setPersonalizationConsent,
} from './logic/personalizationConsent.js'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

const cards = [
  { id: 'card_tools', activity: 'Building useful tools', interest_tags: ['technology', 'problem_solving'] },
  { id: 'card_learners', activity: 'Helping learners grow', interest_tags: ['education'] },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `card_test_${index + 3}`,
    activity: `Test activity ${index + 3}`,
    interest_tags: ['technology'],
  })),
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
  await screen.findByText(cards[0].activity)
  for (let index = 0; index < cards.length; index += 1) {
    await screen.findByText(cards[index].activity)
    fireEvent.click(screen.getByRole('button', { name: index % 2 === 0 ? 'Agree' : 'Disagree' }))
  }
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

  it('uses all backend cards, in backend order, for matching', async () => {
    render(<App />)
    enterDemoCredentials()
    await screen.findByText(cards[0].activity)
    expect(screen.getByText(/01 OF 10/)).toBeTruthy()
    for (let index = 0; index < cards.length; index += 1) {
      await screen.findByText(cards[index].activity)
      fireEvent.click(screen.getByRole('button', { name: index % 2 === 0 ? 'Agree' : 'Disagree' }))
    }
    await screen.findByRole('button', { name: 'Software Developer' })
    const matchesRequest = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/matches'))
    const submitted = JSON.parse(matchesRequest[1].body).responses
    expect(submitted).toHaveLength(cards.length)
    expect(submitted.map(({ card_id }) => card_id)).toEqual(cards.map(({ id }) => id))
    expect(submitted.some(({ card_id }) => card_id === cards[8].id)).toBe(true)
  })

  it('starts swipe personalization consent unchecked', async () => {
    render(<App />)
    enterDemoCredentials()
    await screen.findByText(cards[0].activity)
    const checkbox = screen.getByLabelText(/allow AI to analyze my swipe responses/i)
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  it('supports mouse drag swipes, returns short drags, and ignores A/D keys', async () => {
    render(<App />)
    enterDemoCredentials()
    let card = await screen.findByRole('group', { name: `Swipe card 1: ${cards[0].activity}` })

    fireEvent.keyDown(document, { key: 'd' })
    fireEvent.keyDown(document, { key: 'a' })
    expect(screen.getByRole('group', { name: `Swipe card 1: ${cards[0].activity}` })).toBeTruthy()

    fireEvent.pointerDown(card, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100 })
    fireEvent.pointerMove(card, { pointerId: 1, pointerType: 'mouse', clientX: 145 })
    fireEvent.pointerUp(card, { pointerId: 1, pointerType: 'mouse', clientX: 145 })
    expect(card.style.getPropertyValue('--drag-x')).toBe('0px')
    expect(screen.getByRole('group', { name: `Swipe card 1: ${cards[0].activity}` })).toBeTruthy()

    fireEvent.pointerDown(card, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 100 })
    fireEvent.pointerMove(card, { pointerId: 2, pointerType: 'mouse', clientX: 220 })
    fireEvent.pointerUp(card, { pointerId: 2, pointerType: 'mouse', clientX: 220 })
    card = await screen.findByRole('group', { name: `Swipe card 2: ${cards[1].activity}` })

    fireEvent.pointerDown(card, { pointerId: 3, pointerType: 'touch', clientX: 220 })
    fireEvent.pointerMove(card, { pointerId: 3, pointerType: 'touch', clientX: 90 })
    fireEvent.pointerUp(card, { pointerId: 3, pointerType: 'touch', clientX: 90 })
    expect(await screen.findByRole('group', { name: `Swipe card 3: ${cards[2].activity}` })).toBeTruthy()
  })

  it('keeps swipe, chat, and quiz personalization consent independent', () => {
    const withSwipeConsent = setPersonalizationConsent(initialPersonalizationConsents, 'swipes', true)
    expect(withSwipeConsent).toEqual({ quiz: false, swipes: true, careerChat: false })

    const withChatConsent = setPersonalizationConsent(withSwipeConsent, 'careerChat', true)
    expect(withChatConsent).toEqual({ quiz: false, swipes: true, careerChat: true })

    const withQuizConsent = grantQuizPersonalizationConsent(withChatConsent)
    expect(withQuizConsent).toEqual({ quiz: true, swipes: true, careerChat: true })
    expect(setPersonalizationConsent(withQuizConsent, 'swipes', false)).toEqual({
      quiz: true,
      swipes: false,
      careerChat: true,
    })
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

  it('opens a separate career chat overlay, keeps the draft when collapsed, and disables sending', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    await screen.findByText(career.summary)
    fireEvent.change(screen.getByLabelText('Ask a question about this career'), {
      target: { value: 'What should I learn first?' },
    })
    const callsBeforeOpen = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))

    const chat = await screen.findByRole('dialog', { name: 'Ask about Software Developer' })
    expect(chat.textContent).toContain('Career AI chat is not connected yet.')
    expect(chat.textContent).toContain('What should I learn first?')
    expect(screen.getByRole('button', { name: 'Send question unavailable' }).disabled).toBe(true)
    const chatConsent = screen.getByLabelText(/allow AI to analyze my career chat conversations/i)
    expect(chatConsent.checked).toBe(false)
    fireEvent.click(chatConsent)

    const arrow = document.querySelector('.career-chat-arrow.is-expanded')
    expect(arrow.className).toContain('is-expanded')
    expect(styles).toMatch(/\.career-chat-arrow\.is-expanded\s*\{[^}]*transform:\s*rotate\(180deg\)/)
    expect(styles).toMatch(/\.career-chat-arrow\s*\{[^}]*transform:\s*rotate\(0deg\)/)
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeOpen)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/ai'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse career chat' }))
    const collapsedArrow = document.querySelector('.career-chat-dock .career-chat-arrow')
    expect(collapsedArrow).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand career chat' }))
    expect(screen.getByRole('dialog', { name: 'Ask about Software Developer' }).textContent).toContain('What should I learn first?')
    expect(screen.getByLabelText(/allow AI to analyze my career chat conversations/i).checked).toBe(true)
  })

  it('places the chat overlay above an open detailed career view', async () => {
    render(<App />)
    await reachBubbleExplorer()
    const careerBubble = screen.getByRole('button', { name: 'Software Developer' })
    fireEvent.click(careerBubble)
    fireEvent.doubleClick(careerBubble)
    await screen.findByRole('dialog', { name: 'Software Developer' })

    fireEvent.change(screen.getByLabelText('Ask a question about this career'), {
      target: { value: 'Which skills matter?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))
    await screen.findByRole('dialog', { name: 'Ask about Software Developer' })

    const detailBackdrop = document.querySelector('.career-detail-backdrop')
    const chatBackdrop = document.querySelector('.career-chat-backdrop')
    expect(styles).toMatch(/\.career-chat-backdrop\s*\{[^}]*z-index:\s*50/)
    expect(styles).toMatch(/\.career-detail-backdrop\s*\{[^}]*z-index:\s*20/)
    expect(detailBackdrop.getAttribute('aria-hidden')).toBe('true')
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

  it('preserves the map and quiz answers through the optional journey flow', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    expect(await screen.findByText(career.summary)).toBeTruthy()

    const backendCallsBeforeQuiz = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    expect(screen.getByText('Personalization Notice')).toBeTruthy()
    const answerBox = screen.getByLabelText(/what kind of future or career/i)
    fireEvent.change(answerBox, { target: { value: 'Build tools that help people.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Question 2 of 5')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByLabelText(/what kind of future or career/i).value).toBe('Build tools that help people.')

    fireEvent.click(screen.getByRole('button', { name: /back to bubble explorer/i }))
    expect(screen.getByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByLabelText(/what kind of future or career/i).value).toBe('Build tools that help people.')
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
    expect(screen.getByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
    expect(document.querySelector('.journey-path-card strong').textContent).toBe('Software Developer')
    expect(fetchMock).toHaveBeenCalledTimes(backendCallsBeforeQuiz)
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(screen.getByRole('heading', { name: 'Your journey begins.' })).toBeTruthy()
    expect(document.querySelector('.rpg-card .journey-path-card strong').textContent).toBe('Software Developer')
    fireEvent.click(screen.getByRole('button', { name: /return to bubble explorer/i }))
    expect(screen.getByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    expect(screen.getByText(career.summary)).toBeTruthy()
  })

  it('lets the student skip questions through the final step and continue', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    for (let question = 1; question < 5; question += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Skip Question' }))
      expect(screen.getByText(`Question ${question + 1} of 5`)).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
  })

  it('finishes after answering the fifth question and starts the baseline game', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    for (let index = 0; index < 5; index += 1) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: `Answer ${index + 1}` } })
      fireEvent.click(screen.getByRole('button', { name: index === 4 ? 'Continue' : 'Next' }))
    }
    expect(screen.getByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(screen.getByRole('heading', { name: 'Your journey begins.' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'First steps' })).toBeTruthy()
  })
})
