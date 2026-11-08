const DEFAULT_API_BASE_URL = 'http://localhost:8000'

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
  return configured.replace(/\/+$/, '')
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('Cannot reach the Orquest backend. Check that it is running, then retry.')
  }

  let body
  try {
    body = await response.json()
  } catch {
    throw new ApiError('The backend returned an unreadable response.', {
      status: response.status,
      code: 'unexpected_response',
    })
  }

  if (!response.ok) {
    throw new ApiError(body?.error?.message || `Backend request failed (${response.status}).`, {
      status: response.status,
      code: body?.error?.code || 'request_failed',
    })
  }
  return body
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

const GUIDANCE_STATUSES = new Set(['ai_generated', 'deterministic', 'blocked'])
const GUIDANCE_PROVIDERS = new Set(['gemini', 'openrouter', 'deterministic', 'none'])
const RESOURCE_VERIFICATION_STATES = new Set(['unverified', 'verified', 'stale'])
const MAX_ROADMAP_CONTEXT_LENGTH = 1_000

const QUESTIONNAIRE_ROADMAP_CONTEXT = [
  { index: 0, field: 'goals', label: 'Career or future goal:' },
  { index: 1, field: 'preferences', label: 'Interests, hobbies, and subjects:' },
  // The motivation prompt has no corresponding backend field and is intentionally omitted.
  { index: 3, field: 'preferences', label: 'Preferred challenges and activities:' },
  { index: 4, field: 'goals', label: 'Ideal future:' },
]

function addConsentedQuestionnaireContext(roadmapPayload, answers, hasConsent) {
  if (!hasConsent || !Array.isArray(answers)) return

  for (const { index, field, label } of QUESTIONNAIRE_ROADMAP_CONTEXT) {
    const answer = typeof answers[index] === 'string' ? answers[index].trim() : ''
    if (!answer) continue

    const value = `${label} ${answer}`
    // Count Unicode code points, matching the backend's character-length validation.
    if ([...value].length > MAX_ROADMAP_CONTEXT_LENGTH) {
      throw new ApiError(
        `Your response for “${label.replace(/:$/, '')}” exceeds the backend's 1,000-character limit after its context label. Shorten it before requesting a roadmap.`,
        { code: 'questionnaire_answer_too_long' },
      )
    }

    roadmapPayload[field] ||= []
    roadmapPayload[field].push(value)
  }
}

function isTargetOccupation(value) {
  return typeof value?.career_id === 'string' && typeof value?.title === 'string'
}

function isGuidanceMetadata(value) {
  return GUIDANCE_STATUSES.has(value?.status)
    && GUIDANCE_PROVIDERS.has(value?.provider)
    && (value?.reason == null || typeof value.reason === 'string')
    && typeof value?.review_required === 'boolean'
}

function isResource(value) {
  return typeof value?.id === 'string'
    && typeof value?.title === 'string'
    && typeof value?.organization === 'string'
    && typeof value?.type === 'string'
    && (value.source_url == null || typeof value.source_url === 'string')
    && (value.verified_at == null || typeof value.verified_at === 'string')
    && RESOURCE_VERIFICATION_STATES.has(value.verification_status)
}

function isMissionSuggestion(value) {
  return typeof value?.id === 'string'
    && typeof value?.title === 'string'
    && typeof value?.instruction === 'string'
    && isStringList(value?.resource_ids)
}

function unexpectedGuidanceResponse(message) {
  throw new ApiError(message, { code: 'unexpected_response' })
}

export async function getSwipeCards({ signal } = {}) {
  const body = await request('/api/cards', { signal })
  if (!Array.isArray(body?.cards) || !body.cards.every((card) =>
    typeof card?.id === 'string'
    && typeof card?.activity === 'string'
    && isStringList(card?.interest_tags)
  )) {
    throw new ApiError('The backend swipe-card response does not match the expected format.', {
      code: 'unexpected_response',
    })
  }
  return body.cards
}

export async function getCareerMatches(responses, { signal } = {}) {
  const body = await request('/api/matches', {
    method: 'POST',
    signal,
    body: JSON.stringify({ responses }),
  })
  if (!Array.isArray(body?.matches) || !body.matches.every((match) =>
    typeof match?.career_id === 'string'
    && typeof match?.title === 'string'
    && typeof match?.rationale === 'string'
    && isStringList(match?.matched_interest_tags)
    && typeof match?.interest_score === 'number'
  )) {
    throw new ApiError('The backend match response does not match the expected format.', {
      code: 'unexpected_response',
    })
  }
  return body.matches
}

export async function getCareer(careerId, { signal } = {}) {
  const body = await request(`/api/careers/${encodeURIComponent(careerId)}`, { signal })
  if (typeof body?.career_id !== 'string'
    || typeof body?.title !== 'string'
    || typeof body?.summary !== 'string'
    || !isStringList(body?.requirements)
    || !Array.isArray(body?.sources)
    || !Array.isArray(body?.mdc_resources)
    || !Array.isArray(body?.external_resources)) {
    throw new ApiError('The backend career response does not match the expected format.', {
      code: 'unexpected_response',
    })
  }
  return body
}

export async function submitCareerQuestion(payload, { signal } = {}) {
  const questionPayload = {
    career_id: payload?.career_id,
    question: payload?.question,
  }
  const body = await request('/api/career-questions', {
    method: 'POST',
    signal,
    body: JSON.stringify(questionPayload),
  })
  if (!isTargetOccupation(body?.target_occupation)
    || body.target_occupation.career_id !== questionPayload.career_id
    || typeof body?.answer !== 'string'
    || !isStringList(body?.source_urls)
    || !isStringList(body?.resource_ids)
    || !isGuidanceMetadata(body?.metadata)) {
    unexpectedGuidanceResponse('The backend career-question response does not match the expected format.')
  }
  return body
}

export async function getCareerRoadmap(payload, { signal } = {}) {
  const roadmapPayload = { career_id: payload?.career_id }
  if (Array.isArray(payload?.interest_tags)) roadmapPayload.interest_tags = payload.interest_tags
  addConsentedQuestionnaireContext(
    roadmapPayload,
    payload?.questionnaire_answers,
    payload?.questionnaire_personalization_consent === true,
  )
  const body = await request('/api/roadmaps', {
    method: 'POST',
    signal,
    body: JSON.stringify(roadmapPayload),
  })
  if (!isTargetOccupation(body?.target_occupation)
    || body.target_occupation.career_id !== roadmapPayload.career_id
    || !isStringList(body?.relevant_skills_and_qualifications)
    || !Array.isArray(body?.mdc_pathways) || !body.mdc_pathways.every(isResource)
    || !Array.isArray(body?.alternative_resources) || !body.alternative_resources.every(isResource)
    || !Array.isArray(body?.career_milestones) || !body.career_milestones.every(isMissionSuggestion)
    || !Array.isArray(body?.suggested_missions) || !body.suggested_missions.every(isMissionSuggestion)
    || !isStringList(body?.source_urls)
    || !isStringList(body?.evidence_gaps)
    || !isGuidanceMetadata(body?.metadata)) {
    unexpectedGuidanceResponse('The backend roadmap response does not match the expected format.')
  }
  return body
}
