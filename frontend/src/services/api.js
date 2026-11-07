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
