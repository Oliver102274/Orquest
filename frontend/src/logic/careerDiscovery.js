export function matchesQuestionCondition(condition, answersBySlot) {
  if (!condition?.answer_any_of) return false
  return Object.entries(condition.answer_any_of).every(([slotId, optionIds]) => {
    const value = answersBySlot[slotId]?.value
    const selected = Array.isArray(value) ? value : [value]
    return optionIds.some((optionId) => selected.includes(optionId))
  })
}

export function selectMainQuestion(slot, answersBySlot) {
  return slot.variants.find((variant) => variant.when && matchesQuestionCondition(variant.when, answersBySlot))
    || slot.variants.find((variant) => !variant.when)
    || null
}

export function isFollowUpEligible(followUp, answerValue) {
  if (!followUp) return false
  const selected = Array.isArray(answerValue) ? answerValue : [answerValue]
  const { answer_any_of: anyOf, answer_not_any_of: notAnyOf } = followUp.show_when || {}
  if (anyOf && !anyOf.some((value) => selected.includes(value))) return false
  if (notAnyOf && notAnyOf.some((value) => selected.includes(value))) return false
  return true
}

export function validateDiscoveryAnswer(question, value) {
  const allowed = new Set(question.options?.map(({ id }) => id) || [])
  if (question.answer_type === 'single_choice' || question.answer_type === 'agree_disagree') {
    return typeof value === 'string' && allowed.has(value)
  }
  if (question.answer_type === 'multi_choice') {
    return Array.isArray(value)
      && value.length > 0
      && value.length <= (question.max_selections || question.options.length)
      && new Set(value).size === value.length
      && value.every((id) => allowed.has(id))
      && !(value.includes('undisclosed') && value.length > 1)
  }
  if (question.answer_type === 'short_text') {
    return typeof value === 'string'
      && value.trim().length > 0
      && value.length <= question.max_length
  }
  return false
}

export function recordDiscoveryAnswer(question, value) {
  if (!validateDiscoveryAnswer(question, value)) {
    throw new Error('Choose a valid answer from this question before continuing.')
  }
  return {
    question_id: question.question_id,
    answer_type: question.answer_type,
    value: question.answer_type === 'short_text' ? value.trim() : value,
  }
}

export function recordSkippedFollowUp(entry, questionId) {
  return {
    ...entry,
    follow_up: { status: 'skipped', question_id: questionId },
  }
}

export function recordAnsweredFollowUp(entry, question, value) {
  return {
    ...entry,
    follow_up: { status: 'answered', ...recordDiscoveryAnswer(question, value) },
  }
}
