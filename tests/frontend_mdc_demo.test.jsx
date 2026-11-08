/** @vitest-environment jsdom */
// Copied temporarily into the isolated frontend worktree by the Python runner.
import React from 'react'
import { it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './src/App.jsx'

it('integrates MDC details, explicit career chat, and the active RPG target with the live backend', async () => {
  const realFetch = globalThis.fetch
  const base = process.env.INTEGRATION_API_BASE
  const cards = (await (await realFetch(base + '/api/cards')).json()).cards
  const requests = []
  vi.stubGlobal('fetch', async (url, options = {}) => {
    const path = new URL(url).pathname
    const response = await realFetch(base + path, options)
    if (options.method === 'POST') {
      const responseBody = await response.clone().json()
      requests.push({
        path,
        body: options.body ? JSON.parse(options.body) : null,
        response: responseBody,
      })
    }
    return response
  })
  try {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'student@mdc.edu' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'MDC2026' } })
    fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
    for (const card of cards) {
      await screen.findByText(card.activity)
      fireEvent.click(screen.getByRole('button', { name: 'Agree' }))
    }
    await screen.findByRole('button', { name: 'Cybersecurity Analyst' })
    const matchesRequest = requests.find(request => request.path === '/api/matches')
    expect(matchesRequest.body).toEqual({
      responses: cards.map(card => ({ card_id: card.id, preference: 'like' })),
    })
    expect(JSON.stringify(matchesRequest.body)).not.toContain('QUIZ ANSWER MUST NOT LEAK')

    const cybersecurity = matchesRequest.response.matches.find(match => match.career_id === 'career_cybersecurity_analyst')
    expect(cybersecurity).toBeTruthy()
    const bubble = screen.getByRole('button', { name: cybersecurity.title })
    fireEvent.doubleClick(bubble)
    await screen.findByRole('dialog', { name: cybersecurity.title })
    expect(await screen.findByText(/Cybersecurity — Associate in Science: 60 credits/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'MDC resources' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Open source' }).some(link => link.href === 'https://www.mdc.edu/cybersecurityas/')).toBe(true)
    expect(screen.getByRole('heading', { name: 'External resources' })).toBeTruthy()
    expect(screen.getByText('TryHackMe Pre Security Learning Path')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close career details' }))
    const exploredCareer = matchesRequest.response.matches.find(match => match.career_id !== cybersecurity.career_id)
    expect(exploredCareer).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: exploredCareer.title }))
    expect(await screen.findByText(exploredCareer.title, { selector: '.map-summary h2' })).toBeTruthy()
    expect(document.querySelector('.guide-active-target').textContent).toContain(cybersecurity.title)

    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    await screen.findByRole('heading', { name: 'A little more about you.' })
    const quizAnswer = 'QUIZ ANSWER MUST NOT LEAK'
    fireEvent.change(screen.getByLabelText(/what kind of future or career/i), { target: { value: quizAnswer } })
    fireEvent.click(screen.getByRole('button', { name: /back to bubble explorer/i }))

    fireEvent.change(screen.getByLabelText('Ask a question about this career'), { target: { value: 'How do I begin?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))
    expect(await screen.findByRole('dialog', { name: `Ask about ${exploredCareer.title}` })).toBeTruthy()
    expect(requests.filter(request => request.path === '/api/career-questions')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    expect(await screen.findByText(/AI is unavailable\. This is a catalog-based fallback/i)).toBeTruthy()
    const questionRequest = requests.find(request => request.path === '/api/career-questions')
    expect(questionRequest.body).toEqual({ career_id: exploredCareer.career_id, question: 'How do I begin?' })
    expect(JSON.stringify(questionRequest.body)).not.toContain(quizAnswer)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse career chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByLabelText(/what kind of future or career/i).value).toBe(quizAnswer)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Networks and puzzles' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Motivated by solving problems' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip Question' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A meaningful cybersecurity career' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
    expect(document.querySelector('.journey-path-card strong').textContent).toBe(cybersecurity.title)
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(await screen.findByRole('heading', { name: 'Your journey begins.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /request career roadmap/i }))
    expect(await screen.findByRole('heading', { name: `Roadmap for ${cybersecurity.title}` })).toBeTruthy()
    expect(screen.getByText('DETERMINISTIC CATALOG GUIDANCE')).toBeTruthy()
    const roadmapRequest = requests.find(request => request.path === '/api/roadmaps')
    expect(roadmapRequest.body).toEqual({
      career_id: cybersecurity.career_id,
      goals: [
        'Career or future goal: QUIZ ANSWER MUST NOT LEAK',
        'Ideal future: A meaningful cybersecurity career',
      ],
      preferences: [
        'Interests, hobbies, and subjects: Networks and puzzles',
      ],
    })
    expect(JSON.stringify(roadmapRequest.body)).not.toContain('Motivated by solving problems')
    expect(roadmapRequest.response.target_occupation.career_id).toBe(cybersecurity.career_id)
  } finally {
    cleanup()
    vi.unstubAllGlobals()
  }
}, 30000)
