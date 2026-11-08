/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { createSaveFile, parseSaveFile, saveFileSummary } from './saveFile.js'

const responses = [
  { card_id: 'card_tools', preference: 'like' },
  { card_id: 'card_people', preference: 'dislike' },
]
const softwarePath = {
  career_id: 'career_software_developer',
  title: 'Software Developer',
  matched_interest_tags: ['technology', 'problem_solving'],
}

function makeSave(overrides = {}) {
  return createSaveFile({
    responses,
    exploredCareers: [{ career_id: softwarePath.career_id }],
    careerPaths: [softwarePath],
    activeTargetCareer: softwarePath,
    personalizationConsents: { quiz: false, swipes: false },
    quizAnswers: ['must not be exported without consent'],
    exportedAt: '2026-11-07T12:00:00.000Z',
    ...overrides,
  })
}

describe('versioned local save files', () => {
  it('keeps start-fresh state and omits questionnaire answers unless consent was granted', () => {
    const save = makeSave()
    expect(save.format).toBe('orquest-saved-progress')
    expect(save.version).toBe(1)
    expect(save.data.swipe_responses).toEqual(responses)
    expect(save.data.career_paths).toEqual([{ ...softwarePath, matched_interest_tags: [] }])
    expect(save.data.active_career_id).toBe(softwarePath.career_id)
    expect(save.data.personalization_consents).toEqual({ quiz: false, swipes: false })
    expect(save.data).not.toHaveProperty('questionnaire_answers')
    expect(JSON.stringify(save)).not.toContain('must not be exported')
    expect(JSON.stringify(save)).not.toMatch(/password|credential|chat transcript/i)
  })

  it('preserves all five consented answer positions, including blanks for skipped questions', () => {
    const save = makeSave({
      personalizationConsents: { quiz: true, swipes: true },
      quizAnswers: ['career idea', '', 'motivation', '', 'future picture'],
    })
    expect(save.data.questionnaire_answers).toEqual(['career idea', '', 'motivation', '', 'future picture'])
    expect(parseSaveFile(JSON.stringify(save))).toEqual(save)
    expect(saveFileSummary(save)).toMatchObject({
      questionnaireConsent: true,
      questionnaireAnswerCount: 3,
      careerPathCount: 1,
      activeCareerTitle: 'Software Developer',
    })
  })

  it('stores matched interest tags in saved paths only when swipe personalization is consented', () => {
    const save = makeSave({ personalizationConsents: { quiz: false, swipes: true } })
    expect(save.data.career_paths).toEqual([softwarePath])
  })

  it('rejects malformed, unsupported-version, ambiguous-active-path, and unconsented-answer files', () => {
    const valid = makeSave()
    expect(() => parseSaveFile('{bad json')).toThrow(/valid JSON/i)
    expect(() => parseSaveFile(JSON.stringify({ ...valid, version: 99 }))).toThrow(/version 99/i)
    expect(() => parseSaveFile(JSON.stringify({ ...valid, extra: 'credential' }))).toThrow(/unsupported fields/i)
    expect(() => parseSaveFile(JSON.stringify({
      ...valid,
      data: { ...valid.data, active_career_id: 'career_missing' },
    }))).toThrow(/active career/i)
    expect(() => parseSaveFile(JSON.stringify({
      ...valid,
      data: { ...valid.data, questionnaire_answers: ['unconsented answer'] },
    }))).toThrow(/without recorded personalization consent/i)
    const consented = makeSave({ personalizationConsents: { quiz: true, swipes: false }, quizAnswers: ['', '', '', '', ''] })
    expect(() => parseSaveFile(JSON.stringify({
      ...consented,
      data: { ...consented.data, questionnaire_version: 99 },
    }))).toThrow(/supported prompt version/i)
  })

  it('rejects duplicate swipe cards and duplicate career paths', () => {
    const valid = makeSave()
    expect(() => parseSaveFile(JSON.stringify({
      ...valid,
      data: { ...valid.data, swipe_responses: [...responses, responses[0]] },
    }))).toThrow(/duplicate swipe/i)
    expect(() => parseSaveFile(JSON.stringify({
      ...valid,
      data: { ...valid.data, career_paths: [softwarePath, softwarePath] },
    }))).toThrow(/duplicate career path/i)
  })
})
