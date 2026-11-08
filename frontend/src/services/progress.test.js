/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api.js'
import { completeProgressMission, getProgress, startProgress } from './api.js'

const roadmap = {
  target_occupation: { career_id: 'career_software_developer', title: 'Software Developer' },
  relevant_skills_and_qualifications: [],
  mdc_pathways: [],
  alternative_resources: [],
  career_milestones: [],
  suggested_missions: [],
  source_urls: [],
  evidence_gaps: [],
  metadata: { status: 'deterministic', provider: 'deterministic', review_required: false },
}

const progress = (overrides = {}) => ({
  id: 'progress_1',
  roadmap,
  missions: [{
    id: 'mission_uuid_1',
    title: 'Shadow a developer',
    instruction: 'Observe one working session.',
    resource_ids: [],
    completed: false,
    xp_reward: 25,
  }],
  total_xp: 0,
  storage: 'temporary_memory',
  notice: 'Self-reported practice progress. Expires after 24 hours.',
  ...overrides,
})

function mockFetch(body, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('startProgress', () => {
  it('posts the target and returns the in-memory session', async () => {
    const fetchMock = mockFetch({ access_token: 'token_value', progress: progress() }, 201)

    const session = await startProgress({ target_id: 'career_software_developer' })

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/progress$/)
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ target_id: 'career_software_developer' })
    expect(options.headers.Authorization).toBeUndefined()
    expect(session.access_token).toBe('token_value')
    expect(session.progress.id).toBe('progress_1')
  })

  it('does not pin the XP reward the backend chooses', async () => {
    mockFetch({ access_token: 'token_value', progress: progress({ total_xp: 25, missions: [{ ...progress().missions[0], completed: true }] }) }, 201)
    const session = await startProgress({ target_id: 'career_software_developer' })
    expect(session.progress.total_xp).toBe(25)
    expect(session.progress.missions[0].xp_reward).toBe(25)
  })

  it('rejects a response without an access token', async () => {
    mockFetch({ progress: progress() }, 201)
    await expect(startProgress({ target_id: 'career_software_developer' })).rejects.toBeInstanceOf(ApiError)
  })

  it('rejects a malformed progress mission', async () => {
    mockFetch({ access_token: 'token_value', progress: progress({ missions: [{ id: 'mission_uuid_1' }] }) }, 201)
    await expect(startProgress({ target_id: 'career_software_developer' })).rejects.toBeInstanceOf(ApiError)
  })
})

describe('getProgress and completeProgressMission', () => {
  it('reads a session with the bearer token', async () => {
    const fetchMock = mockFetch(progress())
    const result = await getProgress({ progressId: 'progress_1', accessToken: 'token_value' })

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/progress\/progress_1$/)
    expect(options.headers.Authorization).toBe('Bearer token_value')
    expect(result.id).toBe('progress_1')
  })

  it('records completion with the backend-confirmed body', async () => {
    const fetchMock = mockFetch(progress({ total_xp: 25, missions: [{ ...progress().missions[0], completed: true }] }))
    const updated = await completeProgressMission({ progressId: 'progress_1', accessToken: 'token_value', missionId: 'mission_uuid_1' })

    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/progress\/progress_1\/missions\/mission_uuid_1\/completion$/)
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ completed: true })
    expect(updated.total_xp).toBe(25)
    expect(updated.missions[0].completed).toBe(true)
  })

  it('refuses to call the backend without a session token', async () => {
    const fetchMock = mockFetch(progress())
    await expect(getProgress({ progressId: 'progress_1', accessToken: '' })).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})