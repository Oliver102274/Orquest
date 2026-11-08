// Pure RPG progress helpers. No network, no storage: the backend owns XP and
// completion state, this module only shapes requests and reads server responses.

export const MAX_INTEREST_TAGS = 40
export const OCCUPATION_PREFIX = 'occupation_'

// The catalog picker and the legacy career matches both use `career_id`, so the
// backend's own naming decides the target type instead of a second id field.
export function normalizeRpgTarget(career) {
  if (!career || typeof career.career_id !== 'string' || !career.career_id) return null
  const id = career.career_id
  return {
    type: id.startsWith(OCCUPATION_PREFIX) ? 'occupation' : 'career',
    id,
    title: typeof career.title === 'string' && career.title.trim() ? career.title : 'Selected target',
    matched_interest_tags: Array.isArray(career.matched_interest_tags) ? career.matched_interest_tags : [],
  }
}

// Personalization follows the same consent rules as roadmap guidance: interest tags
// only with swipe consent, questionnaire answers gated inside the API client.
export function buildProgressPayload({ target, interestTags, swipeConsent, answers, quizConsent }) {
  if (!target || typeof target.id !== 'string' || !target.id) return null

  const payload = { target_id: target.id }
  const consentedTags = swipeConsent && Array.isArray(interestTags)
    ? [...new Set(interestTags.filter((tag) => typeof tag === 'string' && tag.trim()))]
    : []
  if (consentedTags.length) payload.interest_tags = consentedTags.slice(0, MAX_INTEREST_TAGS)

  payload.questionnaire_answers = answers
  payload.questionnaire_personalization_consent = quizConsent === true
  return payload
}

export function summarizeProgress(progress) {
  const missions = Array.isArray(progress?.missions) ? progress.missions : []
  const completed = missions.filter((mission) => mission.completed)
  const totalXp = Number.isInteger(progress?.total_xp) ? progress.total_xp : 0

  return {
    total: missions.length,
    completed: completed.length,
    remaining: Math.max(missions.length - completed.length, 0),
    totalXp,
    percent: missions.length ? Math.round((completed.length / missions.length) * 100) : 0,
    nextMission: missions.find((mission) => !mission.completed) || null,
    allComplete: missions.length > 0 && completed.length === missions.length,
  }
}

export function resolveMissionResources(mission, roadmap) {
  const ids = Array.isArray(mission?.resource_ids) ? mission.resource_ids : []
  if (!ids.length) return []

  const pool = [
    ...(Array.isArray(roadmap?.mdc_pathways) ? roadmap.mdc_pathways : []),
    ...(Array.isArray(roadmap?.alternative_resources) ? roadmap.alternative_resources : []),
  ]
  const byId = new Map(pool.map((resource) => [resource.id, resource]))
  return ids.map((id) => byId.get(id)).filter(Boolean)
}

// Session-ending statuses mean the demo store dropped the session (24h TTL, restart
// or full capacity), so the UI can offer a restart instead of a dead end.
export function isSessionOverError(error) {
  return error?.status === 401 || error?.status === 404
}

export function progressErrorMessage(error) {
  const status = error?.status
  if (status === 401) return 'This mission path session expired or was rejected. Start the mission path again.'
  if (status === 404) return 'This temporary progress session is gone (24-hour demo limit or server restart). Start the mission path again.'
  if (status === 409) return 'The backend has no actionable missions for this target yet. Try another target.'
  if (status === 503) return 'The demo progress store is full right now. Try again in a moment.'
  return error?.message || 'The mission request could not be completed. Please retry.'
}