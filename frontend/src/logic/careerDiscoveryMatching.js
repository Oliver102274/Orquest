import careerDiscoveryMatchData from '../data/careerDiscoveryMatchingData.json'
import { CAREER_DISCOVERY_BANK } from '../data/careerDiscoveryQuestionBank.js'
import { isFollowUpEligible, selectMainQuestion, validateDiscoveryAnswer } from './careerDiscovery.js'

function invalidResponse(message) {
  throw new Error(message)
}

function isValidAnswer(question, answerType, value) {
  if (answerType !== question.answer_type) return false
  if (answerType === 'short_text') {
    const limit = question.max_length ?? 1000
    return typeof value === 'string' && value.trim().length > 0 && [...value.trim()].length <= limit
  }
  return validateDiscoveryAnswer(question, value)
}

function validateFollowUp(question, response) {
  const eligible = isFollowUpEligible(question.follow_up, response.value)
  const supplied = response.follow_up

  if (!eligible) {
    if (supplied != null) invalidResponse('An unshown follow-up cannot have a response record.')
    return
  }
  if (!question.follow_up || !supplied) {
    invalidResponse('Shown follow-ups must be answered or explicitly skipped.')
  }
  if (supplied.question_id !== question.follow_up.question_id) {
    invalidResponse('Follow-up ID is not in the bundled question bank.')
  }
  if (supplied.status === 'skipped') {
    if (supplied.answer_type != null || supplied.value != null) {
      invalidResponse('Skipped follow-ups cannot contain an answer.')
    }
    return
  }
  if (supplied.status !== 'answered'
    || !isValidAnswer(question.follow_up, supplied.answer_type, supplied.value)) {
    invalidResponse('Follow-up answer does not match its approved answer structure.')
  }
}

function canonicalTags(tags) {
  return new Set(tags.map((tag) => (tag === 'math' ? 'statistics' : tag)))
}

export function matchCareerDiscoveryResponses(payload) {
  const bank = CAREER_DISCOVERY_BANK
  const careers = careerDiscoveryMatchData.careers
  const responses = payload?.responses

  if (careerDiscoveryMatchData.version !== bank.version) {
    invalidResponse('Bundled question and career mapping versions do not match.')
  }
  if (payload?.bank_version !== bank.version) {
    invalidResponse('Question bank version does not match the bundled approved bank.')
  }
  if (bank.main_question_count !== 8 || bank.slots.length !== 8 || !Array.isArray(responses) || responses.length !== 8) {
    invalidResponse('Career Discovery requires exactly eight main-question responses.')
  }
  if (responses.some((response, index) => response?.slot_id !== bank.slots[index].slot_id)) {
    invalidResponse('Main responses must follow the eight approved question slots in order.')
  }

  const priorAnswers = {}
  bank.slots.forEach((slot, index) => {
    const response = responses[index]
    const question = selectMainQuestion(slot, priorAnswers)
    if (!question || response.question_id !== question.question_id) {
      invalidResponse('Question ID is not the approved variant for the answers already provided.')
    }
    if (!isValidAnswer(question, response.answer_type, response.value)) {
      invalidResponse('Answer does not match the approved question type and options.')
    }
    validateFollowUp(question, response)
    priorAnswers[slot.slot_id] = { value: response.value }
  })

  const validTags = new Set(careers.flatMap((career) => [...canonicalTags(career.interest_tags)]))
  const liked = new Set()
  const disliked = new Set()
  const tagMap = careerDiscoveryMatchData.matching_tags || {}

  for (const response of responses) {
    const answerRecords = [[response.question_id, response.answer_type, response.value]]
    if (response.follow_up?.status === 'answered') {
      answerRecords.push([response.follow_up.question_id, response.follow_up.answer_type, response.follow_up.value])
    }

    for (const [questionId, answerType, value] of answerRecords) {
      if (answerType === 'short_text') continue
      const optionIds = Array.isArray(value) ? value : [value]
      for (const optionId of optionIds) {
        const tags = new Set(tagMap[questionId]?.[optionId] || [])
        if ([...tags].some((tag) => !validTags.has(tag))) {
          invalidResponse('Bundled question tags do not match the current career data.')
        }
        if (answerType === 'agree_disagree' && optionId === 'disagree') {
          tags.forEach((tag) => disliked.add(tag))
        } else if (optionId !== 'undisclosed') {
          tags.forEach((tag) => liked.add(tag))
        }
      }
    }
  }

  const positive = new Set([...liked].filter((tag) => !disliked.has(tag)))
  const negative = new Set([...disliked].filter((tag) => !liked.has(tag)))
  const matches = []

  for (const career of careers) {
    const tags = canonicalTags(career.interest_tags)
    const aligned = [...tags].filter((tag) => positive.has(tag)).sort()
    const net = aligned.length - [...tags].filter((tag) => negative.has(tag)).length
    if (tags.size === 0 || net <= 0) continue
    matches.push({
      career_id: career.career_id,
      title: career.title,
      matched_interest_tags: aligned,
      interest_score: Math.round((100 * net / tags.size) * 100) / 100,
      rationale: `Shared selected interests: ${aligned.join(', ')}. Disagreed signals reduce alignment; conflicting signals cancel.`,
    })
  }

  matches.sort((left, right) => right.interest_score - left.interest_score
    || (left.career_id < right.career_id ? -1 : left.career_id > right.career_id ? 1 : 0))
  Object.defineProperty(matches, 'careerDiscoverySource', { value: 'bundled', configurable: true })
  return matches
}
