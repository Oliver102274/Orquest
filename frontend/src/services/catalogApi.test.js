/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CatalogApiError,
  getJobFamilies,
  getOccupations,
  getOccupationDetail,
  getOccupationMappings,
  getOccupationRoadmap,
} from './catalogApi.js'

const metadata = {
  schema_version: '1.0',
  title: 'Orquest occupation reference catalog',
  based_on: 'job_families_20.md',
  source_data_date_as_reported: '2026-11-07',
  provenance: 'Contributor-provided reference data',
  usage_notes: ['Job-family grouping is for exploration only.'],
  sources: { national_wages: 'https://www.bls.gov/oes/tables.htm' },
  salary_scope: 'United States national figures; not Florida or Miami salaries.',
  verification_notice: 'Reference data; inspect verified_per_row.',
}

const family = {
  id: 'family_computer_math',
  name: 'Computer and Mathematical',
  ordinal: 1,
  bls_group_code: '15-0000',
  bls_group_title: 'Computer and Mathematical Occupations',
  jobs_2025_thousands: 6000,
  median_wage_2025_usd: 105000,
  projected_growth_2025_2035_percent: 10,
  occupation_ids: ['occupation_15_1252'],
}

const occupation = {
  id: 'occupation_15_1252',
  family_id: family.id,
  title: 'Software Developers',
  bls_title: 'Software Developers',
  soc_code: '15-1252',
  onet_soc_code: '15-1252.00',
  summary: 'Design and develop software.',
  national_wage_2025: { median_annual_usd: 133000, p10_annual_usd: 80000, p90_annual_usd: 200000 },
  entry_requirements_as_reported: 'Bachelor degree typical.',
  projected_growth_2025_2035_percent: 16,
  projected_job_change_as_reported: 'Projected growth.',
  source_refs: ['national_wages'],
  verified_per_row: false,
  verified_at: null,
}

function mockFetch(body, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('job catalog API', () => {
  it('loads and validates job families with catalog notices', async () => {
    const fetchMock = mockFetch({ families: [family], metadata })
    const result = await getJobFamilies()
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/job-families')
    expect(result.families).toEqual([family])
    expect(result.metadata.salary_scope).toContain('not Florida')
  })

  it('loads all occupations and family-filtered occupations', async () => {
    const fetchMock = mockFetch({ occupations: [occupation], metadata })
    await getOccupations()
    await getOccupations({ familyId: family.id })
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/occupations')
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/api/occupations?family_id=family_computer_math')
  })

  it('loads an occupation detail with linked legacy IDs', async () => {
    const fetchMock = mockFetch({ occupation, linked_career_ids: ['career_software_developer'], metadata })
    const result = await getOccupationDetail(occupation.id)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/occupations/occupation_15_1252')
    expect(result.occupation.id).toBe(occupation.id)
    expect(result.linked_career_ids).toEqual(['career_software_developer'])
  })

  it('loads education resources from the existing occupation roadmap endpoint without a student profile', async () => {
    const resource = {
      id: 'resource_mdc_program',
      title: 'MDC Program',
      organization: 'Miami Dade College',
      type: 'program',
      source_url: 'https://www.mdc.edu/',
      verification_status: 'verified',
    }
    const fetchMock = mockFetch({
      target_occupation: { career_id: occupation.id, title: occupation.title },
      relevant_skills_and_qualifications: [],
      mdc_pathways: [resource],
      alternative_resources: [],
      career_milestones: [],
      suggested_missions: [],
      source_urls: [],
      evidence_gaps: [],
      metadata: { status: 'deterministic', provider: 'deterministic', review_required: true },
    })
    const result = await getOccupationRoadmap(occupation.id, { profile: {} })
    expect(fetchMock.mock.calls[0][0]).toBe(`http://localhost:8000/api/occupations/${occupation.id}/roadmap`)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(result.mdc_pathways).toEqual([resource])
    expect(result.alternative_resources).toEqual([])
  })

  it('loads explicit career-to-occupation mappings', async () => {
    const fetchMock = mockFetch({
      career_to_occupation: { career_software_developer: occupation.id },
      unmapped_career_ids: ['career_data_analyst'],
    })
    const result = await getOccupationMappings()
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/occupation-mappings')
    expect(result.career_to_occupation.career_software_developer).toBe(occupation.id)
    expect(result.unmapped_career_ids).toContain('career_data_analyst')
  })

  it('rejects malformed catalog data instead of fabricating a fallback', async () => {
    mockFetch({ occupations: [{ id: 'occupation_15_1252' }], metadata })
    await expect(getOccupations()).rejects.toBeInstanceOf(CatalogApiError)
  })

  it('surfaces backend errors', async () => {
    mockFetch({ error: { code: 'not_found', message: 'Job catalog is unavailable.' } }, 503)
    await expect(getJobFamilies()).rejects.toMatchObject({ message: 'Job catalog is unavailable.', status: 503 })
  })
})
