/** @vitest-environment jsdom */
// Copied temporarily into the isolated frontend worktree by the Python runner.
import React from 'react'
import { it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './src/App.jsx'

for (const [id, title] of [['career_software_developer', 'Software Developer'], ['career_data_analyst', 'Data Analyst']]) {
  it(`displays merged MDC resources for ${title} through chat and RPG`, async () => {
    const realFetch = globalThis.fetch
    const base = process.env.INTEGRATION_API_BASE
    const cards = (await (await realFetch(base + '/api/cards')).json()).cards
    const detail = await (await realFetch(base + '/api/careers/' + id)).json()
    expect(detail.mdc_resources).toHaveLength(2)
    vi.stubGlobal('fetch', (url, options = {}) => realFetch(base + new URL(url).pathname, options))
    try {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
      for (const card of cards) {
        await screen.findByText(card.activity)
        fireEvent.click(screen.getByRole('button', { name: 'Agree' }))
      }
      fireEvent.doubleClick(await screen.findByRole('button', { name: title }))
      await screen.findByRole('dialog', { name: title })
      for (const resource of detail.mdc_resources) {
        expect(await screen.findByText(resource.title)).toBeTruthy()
        expect(screen.getAllByRole('link', { name: 'Open source' }).some(link => link.href === resource.source_url)).toBe(true)
      }
      fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close career details' }))
      fireEvent.click(screen.getByRole('button', { name: title }))
      fireEvent.change(await screen.findByLabelText('Ask a question about this career'), { target: { value: 'Which MDC learning resources are available?' } })
      fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))
      fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
      await screen.findByText(/AI is unavailable\. This is a catalog-based fallback/i)
      for (const r of detail.mdc_resources) expect(screen.getByRole('link', { name: r.source_url })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Collapse career chat' }))
      fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
      fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
      fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
      fireEvent.click(screen.getByRole('button', { name: 'START TEMPORARY MISSIONS' }))
      await screen.findByText('Demo XP: 0')
      expect(screen.getByRole('heading', { name: 'Roadmap for ' + title })).toBeTruthy()
      for (const r of detail.mdc_resources) expect(screen.getByText(r.title)).toBeTruthy()
    } finally {
      cleanup()
      vi.unstubAllGlobals()
    }
  }, 30000)
}

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

it('selects a catalog occupation, asks a question, and completes server missions across navigation', async () => {
  const realFetch = globalThis.fetch
  const base = process.env.INTEGRATION_API_BASE
  const cards = (await (await realFetch(base + '/api/cards')).json()).cards
  const requests = []
  let rejectFirstCompletion = true
  vi.stubGlobal('fetch', async (url, options = {}) => {
    const path = new URL(url).pathname
    requests.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (options.method === 'PUT' && rejectFirstCompletion) {
      rejectFirstCompletion = false
      return new Response(JSON.stringify({ error: { code: 'http_error', message: 'Temporary completion failure' } }), { status: 503 })
    }
    return realFetch(base + path, options)
  })
  try {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
    for (const card of cards) {
      await screen.findByText(card.activity)
      fireEvent.click(screen.getByRole('button', { name: 'Agree' }))
    }
    await screen.findByRole('button', { name: 'Cybersecurity Analyst' })
    fireEvent.click(screen.getByRole('button', { name: 'BROWSE JOB CATALOG' }))
    expect(await screen.findByText('20 job families · 115 occupations')).toBeTruthy()
    expect(screen.getByLabelText('Job family').options).toHaveLength(21)
    expect(screen.getByLabelText('Specific occupation').options).toHaveLength(116)
    fireEvent.change(screen.getByLabelText('Specific occupation'), { target: { value: 'occupation_15_1212' } })
    await screen.findByText(/Cybersecurity — Associate in Science: 60 credits/)
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
    fireEvent.change(screen.getByLabelText('Ask a question about this career'), { target: { value: 'Which skills can I investigate?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    await screen.findByText(/AI is unavailable\. This is a catalog-based fallback/i)
    expect(requests.find(r => r.path === '/api/career-questions').body.career_id).toBe('occupation_15_1212')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse career chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close career details' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    fireEvent.click(screen.getByRole('button', { name: 'START TEMPORARY MISSIONS' }))
    await screen.findByText('Demo XP: 0')
    expect(screen.getByText('DETERMINISTIC CATALOG GUIDANCE')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Complete mission (+10 XP)' })[0])
    await screen.findByRole('alert')
    expect(screen.getByText('Demo XP: 0')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Complete mission (+10 XP)' })[0].disabled).toBe(false))
    expect(requests.filter(r => r.method === 'PUT')).toHaveLength(1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Complete mission (+10 XP)' })[0])
    await screen.findByText('Demo XP: 10')
    expect(screen.getByRole('button', { name: 'Completed' }).disabled).toBe(true)
    expect(requests.find(r => r.method === 'PUT').body).toEqual({ completed: true })
    expect(requests.filter(r => r.path === '/api/progress' && r.method === 'POST')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /return to bubble explorer/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    await screen.findByText('Demo XP: 10')
    expect(requests.filter(r => r.path === '/api/progress' && r.method === 'POST')).toHaveLength(1)
  } finally {
    cleanup()
    vi.unstubAllGlobals()
  }
}, 30000)
