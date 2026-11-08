/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BubbleExplorer, { layoutCatalogBubbles } from './BubbleExplorerExperience.jsx'

const mocks = vi.hoisted(() => ({
  getJobFamilies: vi.fn(),
  getOccupations: vi.fn(),
  getOccupationDetail: vi.fn(),
  getOccupationMappings: vi.fn(),
  getOccupationRoadmap: vi.fn(),
  getCareer: vi.fn(),
  getCareerMatches: vi.fn(),
  submitCareerQuestion: vi.fn(),
}))

vi.mock('../services/catalogApi.js', () => ({
  getJobFamilies: mocks.getJobFamilies,
  getOccupations: mocks.getOccupations,
  getOccupationDetail: mocks.getOccupationDetail,
  getOccupationMappings: mocks.getOccupationMappings,
  getOccupationRoadmap: mocks.getOccupationRoadmap,
}))
vi.mock('../services/api.js', () => ({
  getCareer: mocks.getCareer,
  getCareerMatches: mocks.getCareerMatches,
  submitCareerQuestion: mocks.submitCareerQuestion,
}))

const metadata = {
  schema_version: '1.0',
  title: 'Occupation reference catalog',
  based_on: 'job_families_20.md',
  source_data_date_as_reported: '2026-11-07',
  provenance: 'Contributor-provided reference data',
  usage_notes: ['Explore by job family.'],
  sources: { national_wages: 'https://www.bls.gov/oes/tables.htm' },
  salary_scope: 'United States national figures; not Florida or Miami salaries.',
  verification_notice: 'Reference data; inspect verified_per_row.',
}
const family = {
  id: 'family_01_computer_information_technology',
  name: 'Computer & Information Technology',
  ordinal: 1,
  bls_group_code: '15-1200',
  bls_group_title: 'Computer occupations',
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
  summary: 'Design, develop, and maintain software.',
  national_wage_2025: { median_annual_usd: 133000, p10_annual_usd: 80000, p90_annual_usd: 200000 },
  entry_requirements_as_reported: 'Bachelor degree typical.',
  projected_growth_2025_2035_percent: 16,
  projected_job_change_as_reported: 'Projected employment growth.',
  source_refs: ['national_wages'],
  verified_per_row: false,
  verified_at: null,
}
const occupationDetail = { occupation, linked_career_ids: ['career_software_developer'], metadata }
const familyTwo = {
  ...family,
  id: 'family_04_engineering',
  name: 'Engineering',
  ordinal: 4,
  occupation_ids: [],
}
const familyThree = {
  ...family,
  id: 'family_12_architecture_surveying_construction_management',
  name: 'Architecture, Surveying & Construction Management',
  ordinal: 12,
  occupation_ids: [],
}
const educationResource = {
  id: 'resource_mdc_demo',
  title: 'MDC Computer Programming Pathway',
  organization: 'Miami Dade College',
  type: 'program',
  source_url: 'https://www.mdc.edu/',
  verification_status: 'verified',
}
const occupationRoadmap = {
  mdc_pathways: [educationResource],
  alternative_resources: [],
  evidence_gaps: [],
  metadata: { status: 'deterministic', provider: 'deterministic', review_required: true },
}

function renderExplorer(overrides = {}) {
  const onSetActiveTargetCareer = vi.fn()
  const onCareerExploration = vi.fn()
  render(
    <BubbleExplorer
      responses={[]}
      providedMatches={[]}
      matchSource="bundled"
      onEnterRpg={vi.fn()}
      onCareerExploration={onCareerExploration}
      exploredCareerIds={[]}
      activeTargetCareer={null}
      onSetActiveTargetCareer={onSetActiveTargetCareer}
      onExportSave={vi.fn()}
      careerChatPersonalizationConsent={false}
      onCareerChatPersonalizationConsentChange={vi.fn()}
      {...overrides}
    />,
  )
  return { onSetActiveTargetCareer, onCareerExploration }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getJobFamilies.mockResolvedValue({ families: [family, familyTwo, familyThree], metadata })
  mocks.getOccupations.mockImplementation(async ({ familyId } = {}) => ({
    occupations: familyId ? [occupation] : [occupation],
    metadata,
  }))
  mocks.getOccupationMappings.mockResolvedValue({
    career_to_occupation: { career_software_developer: occupation.id, career_cybersecurity_analyst: 'occupation_15_1212' },
    unmapped_career_ids: ['career_data_analyst'],
  })
  mocks.getOccupationDetail.mockResolvedValue(occupationDetail)
  mocks.getOccupationRoadmap.mockResolvedValue(occupationRoadmap)
  mocks.getCareer.mockResolvedValue(null)
  mocks.getCareerMatches.mockResolvedValue([])
  mocks.submitCareerQuestion.mockResolvedValue(null)
})

describe('Bubble Explorer career catalog', () => {
  it('spaces the ten broad fields into two evenly distributed rows and shrinks child bubbles', () => {
    const fields = Array.from({ length: 10 }, (_, index) => ({
      id: `field-${index}`,
      occupationCount: 10,
    }))
    const positions = layoutCatalogBubbles(fields, 'field', 1280)
    expect(positions.get('field-0')).toMatchObject({ x: 12, y: 20 })
    expect(positions.get('field-3')).toMatchObject({ x: 88, y: 20 })
    expect(positions.get('field-4')).toMatchObject({ x: 17, y: 50 })
    expect(positions.get('field-9')).toMatchObject({ x: 70, y: 80 })

    const mobilePositions = layoutCatalogBubbles(fields, 'field', 375)
    expect(mobilePositions.get('field-0')).toMatchObject({ x: 29, y: 12, size: 61 })
    expect(mobilePositions.get('field-9')).toMatchObject({ x: 71, y: 88, size: 61 })

    const families = layoutCatalogBubbles(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      'family',
      1280,
    )
    expect(families.get('a')).toMatchObject({ x: 50, y: 14, size: 70 })
    expect(families.get('b')).toMatchObject({ x: 19, y: 79, size: 70 })
    expect(families.get('c')).toMatchObject({ x: 81, y: 79, size: 70 })
  })

  it('shows a prominent Browse Job Catalog button from the Matches view', async () => {
    renderExplorer()
    const browseButton = screen.getByRole('button', { name: /browse the full job catalog of 115 occupations/i })
    fireEvent.click(browseButton)
    expect(await screen.findByRole('button', { name: 'Explore Engineering & Technology career field' })).toBeTruthy()
  })
  it('loads broad color-coded career fields before showing job families', async () => {
    renderExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'CAREER CATALOG' }))
    const engineeringField = await screen.findByRole('button', { name: 'Explore Engineering & Technology career field' })
    expect(engineeringField.style.getPropertyValue('--bubble-color')).toBe('#72b7b4')
    expect(mocks.getJobFamilies).toHaveBeenCalled()
    expect(mocks.getOccupations).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(mocks.getOccupationMappings).toHaveBeenCalled()
  })

  it('loads a selected family and does not make the family itself the active goal', async () => {
    const { onSetActiveTargetCareer } = renderExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'CAREER CATALOG' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Explore Engineering & Technology career field' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Browse Computer & Information Technology job family' }))
    expect(await screen.findByRole('button', { name: 'Open Software Developers occupation' })).toBeTruthy()
    // The complete occupation list is fetched once; family navigation filters it locally.
    expect(mocks.getOccupations).toHaveBeenCalledTimes(1)
    expect(mocks.getOccupations).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
    }))
    expect(onSetActiveTargetCareer).not.toHaveBeenCalled()
  })

  it('keeps the catalog visible when the optional occupation-mapping endpoint fails', async () => {
    mocks.getOccupationMappings.mockRejectedValueOnce(new Error('mapping endpoint unavailable'))
    renderExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'CAREER CATALOG' }))
    expect(await screen.findByRole('button', { name: 'Explore Engineering & Technology career field' })).toBeTruthy()
    expect(screen.queryByText('CAREER CATALOG IS UNAVAILABLE')).toBeNull()
  })

  it('uses the bundled backend catalog snapshot when live catalog requests return unreadable responses', async () => {
    mocks.getJobFamilies.mockRejectedValueOnce(new Error('unreadable response'))
    mocks.getOccupations.mockRejectedValueOnce(new Error('unreadable response'))
    renderExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'CAREER CATALOG' }))
    expect(await screen.findByRole('button', { name: 'Explore Engineering & Technology career field' })).toBeTruthy()
    expect(screen.getByText(/bundled 115-occupation reference snapshot/i)).toBeTruthy()
    expect(screen.getByText('◈ 115 OCCUPATIONS')).toBeTruthy()
  })

  it('allows an occupation to be explored without silently changing the active goal', async () => {
    const { onSetActiveTargetCareer, onCareerExploration } = renderExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'CAREER CATALOG' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Explore Engineering & Technology career field' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Browse Computer & Information Technology job family' }))
    const node = await screen.findByRole('button', { name: 'Open Software Developers occupation' })
    fireEvent.click(node)
    await waitFor(() => expect(screen.queryByText('OCCUPATION SUMMARY / DOUBLE-CLICK NODE FOR DETAILS')).toBeTruthy())
    expect(onCareerExploration).toHaveBeenCalledWith(expect.objectContaining({ career_id: occupation.id }))
    expect(onSetActiveTargetCareer).not.toHaveBeenCalled()
  })

  it('shows occupation details and only changes the RPG target after explicit selection', async () => {
    const { onSetActiveTargetCareer } = renderExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'CAREER CATALOG' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Explore Engineering & Technology career field' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Browse Computer & Information Technology job family' }))
    const node = await screen.findByRole('button', { name: 'Open Software Developers occupation' })
    fireEvent.doubleClick(node)
    expect(await screen.findByText('UNVERIFIED REFERENCE DATA')).toBeTruthy()
    expect(screen.getAllByText(/United States national figures; not Florida or Miami salaries/)[0]).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Typical entry requirements as reported' })).toBeTruthy()
    expect(await screen.findByText('Educational Resources')).toBeTruthy()
    expect(await screen.findByText('MDC Computer Programming Pathway')).toBeTruthy()
    expect(mocks.getOccupationDetail).toHaveBeenCalledWith(occupation.id, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(mocks.getOccupationRoadmap).toHaveBeenCalledWith(occupation.id, expect.objectContaining({
      signal: expect.any(AbortSignal),
      profile: {},
    }))
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
    expect(onSetActiveTargetCareer).toHaveBeenCalledWith(expect.objectContaining({
      career_id: occupation.id,
      title: occupation.title,
    }))
  })
})
