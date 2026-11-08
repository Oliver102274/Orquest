/** @vitest-environment jsdom */
// Executed against an actual loopback FastAPI server; providers are disabled.
import React from 'react'
import { it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './src/App.jsx'
import { createSaveFile } from './src/logic/saveFile.js'

function connectBackend() {
  const realFetch = globalThis.fetch
  const base = process.env.INTEGRATION_API_BASE
  const calls = []
  vi.stubGlobal('fetch', async (url, options = {}) => {
    const path = new URL(url, base).pathname
    const response = await realFetch(base + path, options)
    if (options.method === 'POST' || options.method === 'PUT') {
      calls.push({ path, options, body: JSON.parse(options.body), result: await response.clone().json() })
    }
    return response
  })
  return { realFetch, base, calls }
}

for (const [id, title] of [
  ['career_software_developer', 'Software Developer'],
  ['career_data_analyst', 'Data Analyst'],
  ['career_cybersecurity_analyst', 'Cybersecurity Analyst'],
]) {
  it(`runs saved swipes, MDC details, chat, roadmap and server XP for ${title}`, async () => {
    const { realFetch, base, calls } = connectBackend()
    try {
      const cards = (await (await realFetch(base + '/api/cards')).json()).cards
      expect(cards).toHaveLength(12)
      const detail = await (await realFetch(base + '/api/careers/' + id)).json()
      expect(detail.mdc_resources.length).toBeGreaterThan(0)
      const target = { career_id: id, title }
      const save = createSaveFile({ responses: cards.map(c => ({card_id:c.id, preference:'like'})),
        exploredCareers: [target], careerPaths: [target], activeTargetCareer: target,
        personalizationConsents: {quiz:false,swipes:false}, quizAnswers: [] })
      render(<App />)
      fireEvent.change(screen.getByLabelText('Choose saved progress JSON file'), {
        target: { files: [{ text: async () => JSON.stringify(save) }] },
      })
      fireEvent.click(await screen.findByRole('button', {name:'CONFIRM IMPORT'}))
      fireEvent.doubleClick(await screen.findByRole('button', { name: title }))
      await screen.findByRole('dialog', {name:title})
      for (const resource of detail.mdc_resources) {
        expect(await screen.findByText(resource.title)).toBeTruthy()
        expect(screen.getAllByRole('link').some(link => link.href === resource.source_url)).toBe(true)
      }
      fireEvent.click(screen.getByRole('button', {name:'Close career details'}))
      fireEvent.click(screen.getByRole('button', {name:title}))
      fireEvent.change(await screen.findByLabelText('Ask a question about this career'), {
        target: {value:'Which MDC learning resources are available?'},
      })
      fireEvent.click(screen.getByRole('button', {name:'Open career chat'}))
      fireEvent.click(screen.getByRole('button', {name:'Send question'}))
      await waitFor(() => expect(calls.some(c => c.path === '/api/career-questions')).toBe(true))
      const chat = calls.find(c => c.path === '/api/career-questions')
      expect(chat.body).toEqual({career_id:id, question:'Which MDC learning resources are available?'})
      expect(chat.result.metadata.status).toBe('deterministic')
      expect(await screen.findByText('CATALOG GUIDANCE')).toBeTruthy()
      for (const r of detail.mdc_resources) expect(screen.getByRole('link', {name:r.source_url})).toBeTruthy()
      fireEvent.click(screen.getByRole('button', {name:'Collapse career chat'}))
      fireEvent.click(screen.getByRole('button', {name:'Enter RPG'}))
      fireEvent.click(screen.getByRole('button', {name:'Skip Quiz'}))
      fireEvent.click(screen.getByRole('button', {name:/start your journey/i}))
      fireEvent.click(screen.getByRole('button', {name:'START PATH'}))
      expect(await screen.findByLabelText('0 XP earned in this path')).toBeTruthy()
      const session = calls.find(c => c.path === '/api/progress').result
      expect(session.progress.roadmap.metadata.status).toBe('deterministic')
      expect(session.progress.roadmap.target_occupation.career_id).toBe(id)
      fireEvent.click(screen.getByRole('button', {name:'CAREER INFO'}))
      for (const r of detail.mdc_resources) expect(await screen.findByText(r.title)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', {name:'Close career guidance'}))
      const mission = session.progress.missions[0]
      fireEvent.click(screen.getByRole('button', {name:`View ${mission.title}; not complete`}))
      fireEvent.click(screen.getByRole('button', {name:/^COMPLETE MISSION/}))
      expect(await screen.findByLabelText(`${mission.xp_reward} XP earned in this path`)).toBeTruthy()
      await waitFor(() => expect(screen.getByRole('button', {name:'MISSION COMPLETE'}).disabled).toBe(true))
      const completion = calls.find(c => c.options.method === 'PUT')
      const repeated = await (await realFetch(base + completion.path, completion.options)).json()
      expect(repeated.total_xp).toBe(mission.xp_reward)
      fireEvent.click(screen.getByRole('button', {name:'Close mission details'}))
      fireEvent.click(screen.getByRole('button', {name:/EXPLORER/i}))
      fireEvent.click(screen.getByRole('button', {name:'Enter RPG'}))
      fireEvent.click(screen.getByRole('button', {name:'Skip Quiz'}))
      fireEvent.click(screen.getByRole('button', {name:/start your journey/i}))
      expect(await screen.findByLabelText(`${mission.xp_reward} XP earned in this path`)).toBeTruthy()
      expect(calls.filter(c => c.path === '/api/progress')).toHaveLength(1)
    } finally { cleanup(); vi.unstubAllGlobals() }
  }, 30000)
}

it('opens the real 20-family/115-occupation catalog from guest discovery and selects an occupation', async () => {
  const { realFetch, base, calls } = connectBackend()
  try {
    expect((await (await realFetch(base + '/api/job-families')).json()).families).toHaveLength(20)
    expect((await (await realFetch(base + '/api/occupations')).json()).occupations).toHaveLength(115)
    render(<App />)
    fireEvent.click(screen.getByRole('button', {name:/enter the hall/i}))
    fireEvent.click(screen.getByRole('button', {name:/skip questionnaire/i}))
    fireEvent.change(await screen.findByLabelText('Search careers, fields, or pathways...'), {target:{value:'Information Security'}})
    fireEvent.doubleClick(await screen.findByRole('button', {name:/Open .*Security.* occupation/}))
    expect(await screen.findByText('UNVERIFIED REFERENCE DATA')).toBeTruthy()
    expect(await screen.findByText(/Cybersecurity — Associate in Science/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name:'CHOOSE THIS AS MY GOAL'}))
    fireEvent.click(screen.getByRole('button', {name:'Close career details'}))
    fireEvent.click(screen.getByRole('button', {name:'Enter RPG'}))
    fireEvent.click(screen.getByRole('button', {name:'Skip Quiz'}))
    fireEvent.click(screen.getByRole('button', {name:/start your journey/i}))
    fireEvent.click(screen.getByRole('button', {name:'START PATH'}))
    expect(await screen.findByLabelText('0 XP earned in this path')).toBeTruthy()
    expect(calls.find(c => c.path === '/api/progress').body.target_id).toBe('occupation_15_1212')
  } finally { cleanup(); vi.unstubAllGlobals() }
}, 30000)
