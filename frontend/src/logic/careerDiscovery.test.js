import { describe, expect, it } from 'vitest'
import { CAREER_DISCOVERY_BANK } from '../data/careerDiscoveryQuestionBank.js'
import {
  isFollowUpEligible,
  recordAnsweredFollowUp,
  recordDiscoveryAnswer,
  recordSkippedFollowUp,
  selectMainQuestion,
  validateDiscoveryAnswer,
} from './careerDiscovery.js'

describe('approved Career Discovery question bank', () => {
  it('contains exactly eight ordered main slots and selects only bank-approved variants', () => {
    expect(CAREER_DISCOVERY_BANK.main_question_count).toBe(8)
    expect(CAREER_DISCOVERY_BANK.slots).toHaveLength(8)
    const selected = selectMainQuestion(CAREER_DISCOVERY_BANK.slots[2], {
      interest_areas: { value: ['math'] },
    })
    expect(selected.question_id).toBe('task_style_analytical_v1')
    expect(CAREER_DISCOVERY_BANK.slots.map(({ slot_id }) => slot_id)).toEqual([
      'education_status', 'interest_areas', 'task_style', 'learning_mode',
      'pathway_interest', 'work_environment', 'problem_area', 'work_priorities',
    ])
  })

  it('uses the prior education answer to select an approved pathway variant', () => {
    const slot = CAREER_DISCOVERY_BANK.slots.find(({ slot_id }) => slot_id === 'pathway_interest')
    expect(selectMainQuestion(slot, { education_status: { value: 'in_high_school' } }).question_id)
      .toBe('pathway_high_school_v1')
    expect(selectMainQuestion(slot, { education_status: { value: 'not_in_school' } }).question_id)
      .toBe('pathway_general_v1')
  })

  it('accepts only listed option IDs and valid answer shapes', () => {
    const single = CAREER_DISCOVERY_BANK.slots[0].variants[0]
    const multi = CAREER_DISCOVERY_BANK.slots[1].variants[0]
    const text = multi.follow_up
    expect(validateDiscoveryAnswer(single, 'undisclosed')).toBe(true)
    expect(validateDiscoveryAnswer(single, 'invented_option')).toBe(false)
    expect(validateDiscoveryAnswer(multi, ['math', 'science'])).toBe(true)
    expect(validateDiscoveryAnswer(multi, ['math', 'invented_option'])).toBe(false)
    expect(validateDiscoveryAnswer(multi, ['undisclosed', 'math'])).toBe(false)
    expect(validateDiscoveryAnswer(text, 'Biology club')).toBe(true)
    expect(validateDiscoveryAnswer(text, 'x'.repeat(301))).toBe(false)
    expect(() => recordDiscoveryAnswer(single, 'invented_option')).toThrow(/valid answer/i)
  })

  it('shows follow-ups only when their approved conditions match the main answer', () => {
    const followUp = CAREER_DISCOVERY_BANK.slots[0].variants[0].follow_up
    expect(isFollowUpEligible(followUp, 'finished_high_school')).toBe(true)
    expect(isFollowUpEligible(followUp, 'in_high_school')).toBe(false)
    expect(isFollowUpEligible(followUp, 'undisclosed')).toBe(false)
  })

  it('records an explicit skip without a negative or scored answer and leaves unshown follow-ups absent', () => {
    const question = CAREER_DISCOVERY_BANK.slots[0].variants[0]
    const entry = { slot_id: 'education_status', ...recordDiscoveryAnswer(question, 'in_high_school') }
    expect(entry).not.toHaveProperty('follow_up')
    const skipped = recordSkippedFollowUp(entry, question.follow_up.question_id)
    expect(skipped.follow_up).toEqual({ status: 'skipped', question_id: 'education_status_followup_v1' })
    expect(skipped.follow_up).not.toHaveProperty('value')
    const answered = recordAnsweredFollowUp(entry, question.follow_up, 'college')
    expect(answered.follow_up).toMatchObject({ status: 'answered', value: 'college' })
  })
})
