const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'

export class CatalogApiError extends Error {
  constructor(message, { status = 0, code = 'catalog_request_failed' } = {}) {
    super(message)
    this.name = 'CatalogApiError'
    this.status = status
    this.code = code
  }
}

function getApiBaseUrl() {
  // Talk directly to the FastAPI server. The backend explicitly allows the
  // local Vite origins, so a dev-server proxy is not required.
  const configured = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
  return configured.replace(/\/+$/, '')
}

async function requestCatalog(path, { signal, method = 'GET', body: requestBody } = {}) {
  let response
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      signal,
      ...(requestBody === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new CatalogApiError('Cannot reach the Orquest catalog. Check that the backend is running, then retry.')
  }

  let body
  try {
    body = await response.json()
  } catch {
    const contentType = response.headers?.get?.('content-type') || 'unknown content type'
    throw new CatalogApiError(
      `The catalog endpoint returned an unreadable response (HTTP ${response.status}, ${contentType}). Expected JSON from http://127.0.0.1:8000.`,
      {
        status: response.status,
        code: 'unexpected_response',
      },
    )
  }

  if (!response.ok) {
    throw new CatalogApiError(body?.error?.message || `Catalog request failed (${response.status}).`, {
      status: response.status,
      code: body?.error?.code || 'request_failed',
    })
  }
  return body
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isCatalogMetadata(value) {
  return typeof value?.schema_version === 'string'
    && typeof value?.title === 'string'
    && typeof value?.based_on === 'string'
    && typeof value?.source_data_date_as_reported === 'string'
    && typeof value?.provenance === 'string'
    && isStringList(value?.usage_notes)
    && value?.sources != null
    && typeof value.sources === 'object'
    && !Array.isArray(value.sources)
    && Object.values(value.sources).every((url) => typeof url === 'string')
    && typeof value?.salary_scope === 'string'
    && typeof value?.verification_notice === 'string'
}

function isJobFamily(value) {
  return typeof value?.id === 'string'
    && typeof value?.name === 'string'
    && Number.isInteger(value?.ordinal)
    && typeof value?.bls_group_code === 'string'
    && typeof value?.bls_group_title === 'string'
    && Number.isFinite(value?.jobs_2025_thousands)
    && Number.isFinite(value?.median_wage_2025_usd)
    && Number.isFinite(value?.projected_growth_2025_2035_percent)
    && isStringList(value?.occupation_ids)
}

function isOccupation(value) {
  return typeof value?.id === 'string'
    && typeof value?.family_id === 'string'
    && typeof value?.title === 'string'
    && typeof value?.bls_title === 'string'
    && typeof value?.soc_code === 'string'
    && typeof value?.onet_soc_code === 'string'
    && typeof value?.summary === 'string'
    && Number.isFinite(value?.national_wage_2025?.median_annual_usd)
    && Number.isFinite(value?.national_wage_2025?.p10_annual_usd)
    && Number.isFinite(value?.national_wage_2025?.p90_annual_usd)
    && typeof value?.entry_requirements_as_reported === 'string'
    && Number.isFinite(value?.projected_growth_2025_2035_percent)
    && typeof value?.projected_job_change_as_reported === 'string'
    && isStringList(value?.source_refs)
    && typeof value?.verified_per_row === 'boolean'
    && (value?.verified_at == null || typeof value.verified_at === 'string')
}

function validateMetadata(metadata) {
  if (!isCatalogMetadata(metadata)) {
    throw new CatalogApiError('The catalog metadata does not match the expected backend format.', {
      code: 'unexpected_response',
    })
  }
  return metadata
}

export async function getJobFamilies({ signal } = {}) {
  const body = await requestCatalog('/api/job-families', { signal })
  if (!Array.isArray(body?.families) || !body.families.every(isJobFamily)) {
    throw new CatalogApiError('The job-family response does not match the expected backend format.', {
      code: 'unexpected_response',
    })
  }
  return { families: body.families, metadata: validateMetadata(body.metadata) }
}

export async function getOccupations({ familyId, signal } = {}) {
  const query = familyId ? `?family_id=${encodeURIComponent(familyId)}` : ''
  const body = await requestCatalog(`/api/occupations${query}`, { signal })
  if (!Array.isArray(body?.occupations) || !body.occupations.every(isOccupation)) {
    throw new CatalogApiError('The occupation response does not match the expected backend format.', {
      code: 'unexpected_response',
    })
  }
  return { occupations: body.occupations, metadata: validateMetadata(body.metadata) }
}

export async function getOccupationDetail(occupationId, { signal } = {}) {
  if (typeof occupationId !== 'string' || !occupationId.trim()) {
    throw new CatalogApiError('An occupation ID is required.', { code: 'occupation_id_required' })
  }
  const body = await requestCatalog(`/api/occupations/${encodeURIComponent(occupationId)}`, { signal })
  if (!isOccupation(body?.occupation)
    || !isStringList(body?.linked_career_ids)
    || !isCatalogMetadata(body?.metadata)) {
    throw new CatalogApiError('The occupation-detail response does not match the expected backend format.', {
      code: 'unexpected_response',
    })
  }
  return {
    occupation: body.occupation,
    linked_career_ids: body.linked_career_ids,
    metadata: validateMetadata(body.metadata),
  }
}

export async function getOccupationMappings({ signal } = {}) {
  const body = await requestCatalog('/api/occupation-mappings', { signal })
  const mapping = body?.career_to_occupation
  if (mapping == null || typeof mapping !== 'object' || Array.isArray(mapping)
    || !Object.entries(mapping).every(([careerId, occupationId]) =>
      typeof careerId === 'string' && typeof occupationId === 'string')
    || !isStringList(body?.unmapped_career_ids)) {
    throw new CatalogApiError('The occupation-mapping response does not match the expected backend format.', {
      code: 'unexpected_response',
    })
  }
  return { career_to_occupation: mapping, unmapped_career_ids: body.unmapped_career_ids }
}


function isCatalogResource(value) {
  return typeof value?.id === 'string'
    && typeof value?.title === 'string'
    && typeof value?.organization === 'string'
    && typeof value?.type === 'string'
    && ['verified', 'unverified', 'stale'].includes(value?.verification_status)
    && (value?.source_url == null || typeof value.source_url === 'string')
}

export async function getOccupationRoadmap(occupationId, { signal, profile = {} } = {}) {
  if (typeof occupationId !== 'string' || !occupationId.trim()) {
    throw new CatalogApiError('An occupation ID is required.', { code: 'occupation_id_required' })
  }
  const body = await requestCatalog(
    `/api/occupations/${encodeURIComponent(occupationId)}/roadmap`,
    { signal, method: 'POST', body: profile },
  )
  if (!Array.isArray(body?.mdc_pathways)
    || !body.mdc_pathways.every(isCatalogResource)
    || !Array.isArray(body?.alternative_resources)
    || !body.alternative_resources.every(isCatalogResource)) {
    throw new CatalogApiError('The occupation roadmap did not include resources in the expected format.', {
      code: 'unexpected_response',
    })
  }
  return {
    mdc_pathways: body.mdc_pathways,
    alternative_resources: body.alternative_resources,
    evidence_gaps: Array.isArray(body?.evidence_gaps) ? body.evidence_gaps : [],
    metadata: body?.metadata || null,
  }
}
