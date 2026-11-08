export const ORQUEST_SAVE_FORMAT = 'orquest-saved-progress'
export const ORQUEST_SAVE_VERSION = 1

const MAX_SAVE_CHARACTERS = 1_000_000
const INTEREST_TAG_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/
const OPTIONAL_QUESTION_COUNT = 5
const OPTIONAL_QUESTIONNAIRE_VERSION = 1

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.includes(key))
}

function isIdentifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value === value.trim()
}

function invalidSave(message) {
  throw new Error(message)
}

export function createSaveFile({
  responses,
  exploredCareers,
  careerPaths,
  activeTargetCareer,
  personalizationConsents,
  quizAnswers,
  exportedAt = new Date().toISOString(),
}) {
  const data = {
    swipe_responses: responses.map(({ card_id, preference }) => ({ card_id, preference })),
    explored_career_ids: exploredCareers.map(({ career_id }) => career_id),
    career_paths: careerPaths.map(({ career_id, title, matched_interest_tags = [] }) => ({
      career_id,
      title,
      matched_interest_tags: personalizationConsents.swipes ? [...matched_interest_tags] : [],
    })),
    active_career_id: activeTargetCareer?.career_id || null,
    personalization_consents: {
      quiz: Boolean(personalizationConsents.quiz),
      swipes: Boolean(personalizationConsents.swipes),
    },
  }

  if (data.personalization_consents.quiz) {
    data.questionnaire_version = OPTIONAL_QUESTIONNAIRE_VERSION
    data.questionnaire_answers = Array.from({ length: OPTIONAL_QUESTION_COUNT }, (_, index) =>
      typeof quizAnswers[index] === 'string' ? quizAnswers[index] : ''
    )
  }

  return {
    format: ORQUEST_SAVE_FORMAT,
    version: ORQUEST_SAVE_VERSION,
    exported_at: exportedAt,
    data,
  }
}

export function parseSaveFile(text) {
  if (typeof text !== 'string' || text.length > MAX_SAVE_CHARACTERS) {
    invalidSave('This save file is too large or unreadable.')
  }

  let file
  try {
    file = JSON.parse(text)
  } catch {
    invalidSave('This file is not valid JSON. Choose an unmodified Orquest save file.')
  }

  if (!isRecord(file) || file.format !== ORQUEST_SAVE_FORMAT) {
    invalidSave('This is not an Orquest saved-progress file.')
  }
  if (file.version !== ORQUEST_SAVE_VERSION) {
    invalidSave(`This save uses version ${String(file.version)}. This build can import version ${ORQUEST_SAVE_VERSION} only.`)
  }
  if (!hasOnlyKeys(file, ['format', 'version', 'exported_at', 'data'])
    || typeof file.exported_at !== 'string'
    || Number.isNaN(Date.parse(file.exported_at))
    || !isRecord(file.data)) {
    invalidSave('The save file is missing required information or contains unsupported fields.')
  }

  const { data } = file
  const allowedDataKeys = [
    'swipe_responses',
    'explored_career_ids',
    'career_paths',
    'active_career_id',
    'personalization_consents',
    'questionnaire_version',
    'questionnaire_answers',
  ]
  if (!hasOnlyKeys(data, allowedDataKeys)
    || !Array.isArray(data.swipe_responses)
    || data.swipe_responses.length > 1000
    || !Array.isArray(data.explored_career_ids)
    || data.explored_career_ids.length > 1000
    || !Array.isArray(data.career_paths)
    || data.career_paths.length > 100
    || !isRecord(data.personalization_consents)
    || !hasOnlyKeys(data.personalization_consents, ['quiz', 'swipes'])
    || typeof data.personalization_consents.quiz !== 'boolean'
    || typeof data.personalization_consents.swipes !== 'boolean'
    || !(data.active_career_id === null || isIdentifier(data.active_career_id))) {
    invalidSave('The save file has an unsupported or incomplete progress structure.')
  }

  const cardIds = new Set()
  for (const response of data.swipe_responses) {
    if (!isRecord(response)
      || !hasOnlyKeys(response, ['card_id', 'preference'])
      || !isIdentifier(response.card_id)
      || !['like', 'dislike', 'skip'].includes(response.preference)
      || cardIds.has(response.card_id)) {
      invalidSave('The save contains an invalid or duplicate swipe response.')
    }
    cardIds.add(response.card_id)
  }

  if (!data.explored_career_ids.every(isIdentifier)
    || new Set(data.explored_career_ids).size !== data.explored_career_ids.length) {
    invalidSave('The save contains an invalid or duplicate explored-career ID.')
  }

  const careerIds = new Set()
  for (const careerPath of data.career_paths) {
    if (!isRecord(careerPath)
      || !hasOnlyKeys(careerPath, ['career_id', 'title', 'matched_interest_tags'])
      || !isIdentifier(careerPath.career_id)
      || typeof careerPath.title !== 'string'
      || !careerPath.title.trim()
      || !Array.isArray(careerPath.matched_interest_tags)
      || careerPath.matched_interest_tags.length > 40
      || !careerPath.matched_interest_tags.every((tag) => typeof tag === 'string' && INTEREST_TAG_PATTERN.test(tag))
      || careerIds.has(careerPath.career_id)) {
      invalidSave('The save contains an invalid or duplicate career path.')
    }
    careerIds.add(careerPath.career_id)
  }

  if (data.active_career_id !== null && !careerIds.has(data.active_career_id)) {
    invalidSave('The active career must refer to one of the saved career paths.')
  }

  if (data.personalization_consents.quiz) {
    if (data.questionnaire_version !== OPTIONAL_QUESTIONNAIRE_VERSION
      || !Array.isArray(data.questionnaire_answers)
      || data.questionnaire_answers.length !== OPTIONAL_QUESTION_COUNT
      || !data.questionnaire_answers.every((answer) => typeof answer === 'string')) {
      invalidSave('Consented questionnaire answers must use a supported prompt version and contain all five positions; skipped answers must remain empty.')
    }
  } else if (Object.hasOwn(data, 'questionnaire_answers') || Object.hasOwn(data, 'questionnaire_version')) {
    invalidSave('Questionnaire answers cannot be imported without recorded personalization consent.')
  }

  return file
}

export function saveFileSummary(file) {
  const { data } = file
  return {
    swipeCount: data.swipe_responses.length,
    careerPathCount: data.career_paths.length,
    activeCareerTitle: data.career_paths.find((path) => path.career_id === data.active_career_id)?.title || null,
    questionnaireAnswerCount: data.personalization_consents.quiz
      ? data.questionnaire_answers.filter((answer) => answer.trim()).length
      : 0,
    questionnaireConsent: data.personalization_consents.quiz,
  }
}
