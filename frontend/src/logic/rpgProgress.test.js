/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import {
  buildProgressPayload,
  isSessionOverError,
  normalizeRpgTarget,
  progressErrorMessage,
  resolveMissionResources,
  summarizeProgress,
} from './rpgProgress.js'

const occupationTarget = { career_id: 'occupation_15_1212', title: 'Software Developer' }
const careerTarget = { career_id: 'career_software_developer', title: 'Software Developer', matched_interest_tags: ['building'] }

const roadmap = {
  mdc_pathways: [{ id: 'res_1', title: 'MDC pathway', organization: 'MDC', type: 'pathway' }],
  alternative_resources: [{ id: 'res_2', title: 'Free course', organization: 'OpenLearn', type: 'course' }],
}

const mission = (overrides = {}) => ({
  id: 'mission_uuid_1',
  title: 'Shadow a developer',
  instruction: 'Spend one hour observing a working developer.',
  resource_ids: ['res_2'],
  completed: false,
  xp_reward: 10,
  ...overrides,
})

describe('normalizeRpgTarget', () => {
  it('reads the target type from the backend id prefix', () => {
    expect(normalizeRpgTarget(occupationTarget)).toEqual({ type: 'occupation', id: 'occupation_15_1212', title: 'Software Developer', matched_interest_tags: [] })
    expect(normalizeRpgTarget(careerTarget).type).toBe('career')
  })

  it('returns null without a usable target', () => {
    expect(normalizeRpgTarget(null)).toBeNull()
    expect(normalizeRpgTarget({ title: 'No id' })).toBeNull()
  })
})

describe('buildProgressPayload', () => {
  it('sends only the target when nothing is consented', () => {
    const payload = buildProgressPayload({
      target: normalizeRpgTarget(careerTarget),
      interestTags: ['building'],
      swipeConsent: false,
      answers: ['goal'],
      quizConsent: false,
    })
    expect(payload).toEqual({ target_id: 'career_software_developer', questionnaire_answers: ['goal'], questionnaire_personalization_consent: false })
  })

  it('deduplicates and caps consented interest tags', () => {
    const tags = [...Array(50)].map((_, index) => `tag_${index % 45}`)
    const payload = buildProgressPayload({
      target: normalizeRpgTarget(careerTarget),
      interestTags: ['building', 'building', ...tags],
      swipeConsent: true,
      answers: [],
      quizConsent: true,
    })
    expect(payload.interest_tags.length).toBe(40)
    expect(new Set(payload.interest_tags).size).toBe(40)
    expect(payload.questionnaire_personalization_consent).toBe(true)
  })

  it('returns null when there is no target', () => {
    expect(buildProgressPayload({ target: null })).toBeNull()
  })
})

describe('summarizeProgress', () => {
  it('reads XP and completion from the server response only', () => {
    const summary = summarizeProgress({
      total_xp: 10,
      missions: [mission({ completed: true }), mission({ id: 'mission_uuid_2' })],
    })
    expect(summary).toMatchObject({ total: 2, completed: 1, remaining: 1, totalXp: 10, percent: 50, allComplete: false })
    expect(summary.nextMission.id).toBe('mission_uuid_2')
  })

  it('flags a fully completed path and tolerates an empty response', () => {
    expect(summarizeProgress({ total_xp: 20, missions: [mission({ completed: true })] })).toMatchObject({ allComplete: true, remaining: 0, totalXp: 20 })
    expect(summarizeProgress(null)).toMatchObject({ total: 0, completed: 0, remaining: 0, totalXp: 0, percent: 0, nextMission: null, allComplete: false })
  })
})

describe('resolveMissionResources', () => {
  it('joins mission resource ids against the roadmap resources', () => {
    expect(resolveMissionResources(mission({ resource_ids: ['res_2', 'missing'] }), roadmap).map((item) => item.id)).toEqual(['res_2'])
    expect(resolveMissionResources(mission(), null)).toEqual([])
  })
})

describe('progressErrorMessage', () => {
  it('explains session-ending and capacity errors', () => {
    expect(progressErrorMessage({ status: 401 })).toMatch(/start the mission path again/i)
    expect(progressErrorMessage({ status: 404 })).toMatch(/24-hour/i)
    expect(progressErrorMessage({ status: 409 })).toMatch(/no actionable missions/i)
    expect(progressErrorMessage({ status: 503 })).toMatch(/full/i)
    expect(progressErrorMessage({ message: 'Custom failure' })).toBe('Custom failure')
  })

  it('treats expired or missing sessions as restartable', () => {
    expect(isSessionOverError({ status: 401 })).toBe(true)
    expect(isSessionOverError({ status: 404 })).toBe(true)
    expect(isSessionOverError({ status: 409 })).toBe(false)
  })
})