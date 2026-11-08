const DEFAULT_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8000' : ''

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function getApiBaseUrl() {
  // Use the backend's explicit IPv4 loopback address in development. The
  // backend CORS allowlist includes localhost:5173 and 127.0.0.1:5173, and
  // this avoids accidentally receiving Vite's index.html from an unconfigured
  // same-origin /api request.
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

// Server-backed contract for a later backend route merge. The current survey UI
// uses its bundled question bank and local matching map instead of these calls.
export async function getCareerDiscoveryQuestionBank({ signal } = {}) {
  const body = await request('/api/career-discovery/questions', { signal })
  if (typeof body?.bank_id !== 'string'
    || typeof body?.version !== 'string'
    || body?.main_question_count !== 8
    || !Array.isArray(body?.slots)
    || body.slots.length !== 8
    || body.slots.some((slot) => typeof slot?.slot_id !== 'string'
      || !Array.isArray(slot?.variants)
      || slot.variants.length === 0
      || slot.variants.some((question) => typeof question?.question_id !== 'string'
        || !['single_choice', 'multi_choice', 'agree_disagree', 'short_text'].includes(question?.answer_type)))) {
    throw new ApiError('The Career Discovery question bank does not match the expected format.', {
      code: 'unexpected_response',
    })
  }
  return body
}

export async function getCareerDiscoveryMatches(payload, { signal } = {}) {
  const body = await request('/api/career-discovery/matches', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      bank_version: payload?.bank_version,
      responses: payload?.responses,
    }),
  })
  if (!Array.isArray(body?.matches) || !body.matches.every((match) =>
    typeof match?.career_id === 'string'
    && typeof match?.title === 'string'
    && typeof match?.rationale === 'string'
    && isStringList(match?.matched_interest_tags)
    && typeof match?.interest_score === 'number'
  )) {
    throw new ApiError('The Career Discovery match response does not match the expected format.', {
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

function assertRoadmapResponse(body, expectedCareerId) {
  if (!isTargetOccupation(body?.target_occupation)
    || body.target_occupation.career_id !== expectedCareerId
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
  return assertRoadmapResponse(body, roadmapPayload.career_id)
}

// RPG progress (Phase 15). The access token is returned once per session and is
// held in memory by the caller; it is never persisted or written into a save file.

function progressHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}` }
}

// xp_reward is server-owned. Accept any non-negative integer instead of pinning the
// current reward so a backend reward change cannot break the RPG screen.
function isProgressMission(value) {
  return typeof value?.id === 'string'
    && typeof value?.title === 'string'
    && typeof value?.instruction === 'string'
    && isStringList(value?.resource_ids)
    && typeof value?.completed === 'boolean'
    && Number.isInteger(value?.xp_reward) && value.xp_reward >= 0
}

function assertProgressResponse(body) {
  if (typeof body?.id !== 'string'
    || typeof body?.storage !== 'string'
    || typeof body?.notice !== 'string'
    || !Number.isInteger(body?.total_xp) || body.total_xp < 0
    || !Array.isArray(body?.missions) || !body.missions.every(isProgressMission)
    || body?.roadmap == null) {
    unexpectedGuidanceResponse('The backend RPG progress response does not match the expected format.')
  }
  assertRoadmapResponse(body.roadmap, body.roadmap.target_occupation.career_id)
  return body
}

function requireSession(progressId, accessToken) {
  if (typeof progressId !== 'string' || typeof accessToken !== 'string' || !progressId || !accessToken) {
    throw new ApiError('This mission path needs an active progress session. Start the mission path again.', {
      status: 401,
      code: 'progress_session_required',
    })
  }
}

export async function startProgress(payload, { signal } = {}) {
  const progressPayload = { target_id: payload?.target_id || payload?.career_id }
  if (Array.isArray(payload?.interest_tags)) progressPayload.interest_tags = payload.interest_tags
  addConsentedQuestionnaireContext(
    progressPayload,
    payload?.questionnaire_answers,
    payload?.questionnaire_personalization_consent === true,
  )
  const body = await request('/api/progress', {
    method: 'POST',
    signal,
    body: JSON.stringify(progressPayload),
  })
  if (typeof body?.access_token !== 'string' || !body.access_token) {
    unexpectedGuidanceResponse('The backend RPG progress response did not include a session token.')
  }
  return { access_token: body.access_token, progress: assertProgressResponse(body?.progress) }
}

export async function getProgress({ progressId, accessToken }, { signal } = {}) {
  requireSession(progressId, accessToken)
  const body = await request(`/api/progress/${encodeURIComponent(progressId)}`, {
    signal,
    headers: progressHeaders(accessToken),
  })
  return assertProgressResponse(body)
}

export async function completeProgressMission({ progressId, accessToken, missionId }, { signal } = {}) {
  requireSession(progressId, accessToken)
  if (typeof missionId !== 'string' || !missionId) {
    throw new ApiError('A mission id is required to record a completion.', { code: 'mission_id_required' })
  }
  const body = await request(
    `/api/progress/${encodeURIComponent(progressId)}/missions/${encodeURIComponent(missionId)}/completion`,
    {
      method: 'PUT',
      signal,
      headers: progressHeaders(accessToken),
      body: JSON.stringify({ completed: true }),
    },
  )
  return assertProgressResponse(body)
}

export async function getJobCatalog({ signal } = {}) {
  const [families, occupations] = await Promise.all([
    request('/api/job-families', { signal }), request('/api/occupations', { signal }),
  ])
  if (!Array.isArray(families?.families) || !Array.isArray(occupations?.occupations)
    || !families.families.every(f => typeof f.id === 'string' && typeof f.name === 'string')
    || !occupations.occupations.every(o => typeof o.id === 'string' && typeof o.title === 'string' && typeof o.family_id === 'string')) {
    unexpectedGuidanceResponse('The job catalog response is invalid.')
  }
  return { families: families.families, occupations: occupations.occupations, metadata: occupations.metadata }
}


// Compatibility for existing callers; rewards always come from the server.
export async function completeMission(session, missionId, options = {}) {
  return completeProgressMission({ progressId: session.progress.id, accessToken: session.access_token, missionId }, options)
}


export async function getOccupationResources(occupationId, { signal } = {}) {
  const body = await request(
    `/api/occupations/${encodeURIComponent(occupationId)}/resources`,
    { signal },
  )

  const isRelatedCandidate = (item) =>
    typeof item?.id === 'string'
    && typeof item?.title === 'string'
    && typeof item?.organization === 'string'
    && typeof item?.source_url === 'string'
    && item.verification_status === 'unverified'
    && item.match_type === 'keyword_candidate'
    && typeof item.relevance_score === 'number'
    && isStringList(item.matched_keywords)

  const isExternalSearch = (item) =>
    typeof item?.title === 'string'
    && typeof item?.organization === 'string'
    && item.type === 'external_search'
    && typeof item?.url === 'string'
    && typeof item?.search_term === 'string'

  if (
    body?.occupation_id !== occupationId
    || typeof body?.occupation_title !== 'string'
    || !Array.isArray(body?.resources)
    || !body.resources.every(isResource)
    || !Array.isArray(body?.related_resources)
    || !body.related_resources.every(isRelatedCandidate)
    || !Array.isArray(body?.external_search_options)
    || !body.external_search_options.every(isExternalSearch)
  ) {
    throw new ApiError(
      'The educational resources response does not match the expected format.',
      { code: 'unexpected_response' },
    )
  }

  return body
}
