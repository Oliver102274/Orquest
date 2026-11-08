/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import App from './App.jsx'
import { getCareerDiscoveryMatches, getCareerDiscoveryQuestionBank, getCareerRoadmap, submitCareerQuestion } from './services/api.js'
import { createSaveFile } from './logic/saveFile.js'
import { CAREER_DISCOVERY_BANK } from './data/careerDiscoveryQuestionBank.js'
import {
  grantQuizPersonalizationConsent,
  initialPersonalizationConsents,
  setPersonalizationConsent,
} from './logic/personalizationConsent.js'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

const cards = [
  { id: 'card_tools', activity: 'Building useful tools', interest_tags: ['technology', 'problem_solving'] },
  { id: 'card_learners', activity: 'Helping learners grow', interest_tags: ['education'] },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `card_test_${index + 3}`,
    activity: `Test activity ${index + 3}`,
    interest_tags: ['technology'],
  })),
]

const matches = [
  {
    career_id: 'career_software_developer',
    title: 'Software Developer',
    rationale: 'Shared liked tags: technology.',
    matched_interest_tags: ['technology', 'problem_solving'],
    interest_score: 80,
  },
  {
    career_id: 'career_cybersecurity_analyst',
    title: 'Cybersecurity Analyst',
    rationale: 'Shared liked tags: technology and security.',
    matched_interest_tags: ['technology', 'security'],
    interest_score: 70,
  },
]

const career = {
  career_id: 'career_software_developer',
  title: 'Software Developer',
  summary: 'Software developers design, build, test, and maintain software applications and systems.',
  requirements: ['Knowledge of programming languages', 'Problem-solving and analytical skills'],
  sources: [{ title: 'BLS Occupational Outlook Handbook', url: 'https://example.org/career', verification_status: 'unverified', verified_at: null }],
  mdc_resources: [],
  external_resources: [],
}

const cybersecurityCareer = {
  ...career,
  career_id: 'career_cybersecurity_analyst',
  title: 'Cybersecurity Analyst',
  summary: 'Cybersecurity analysts investigate and help protect information systems.',
}

const questionResponse = {
  target_occupation: { career_id: career.career_id, title: career.title },
  answer: 'Catalog guidance for your submitted question.',
  source_urls: ['https://example.org/career-guide'],
  resource_ids: ['resource_guide'],
  metadata: { status: 'deterministic', provider: 'deterministic', reason: 'ai_disabled', review_required: true },
}

const roadmapStep = {
  id: 'draft_step_1',
  title: 'Investigate a verified option',
  instruction: 'Review the supplied resource with an advisor.',
  resource_ids: ['resource_guide'],
}

const roadmapResponse = {
  target_occupation: { career_id: career.career_id, title: career.title },
  relevant_skills_and_qualifications: [],
  mdc_pathways: [],
  alternative_resources: [{
    id: 'resource_guide', title: 'Career Guide', organization: 'Example', type: 'guide',
    source_url: 'https://example.org/career-guide', verified_at: '2026-01-01T00:00:00Z', verification_status: 'verified',
  }],
  career_milestones: [roadmapStep],
  suggested_missions: [roadmapStep],
  source_urls: ['https://example.org/career-guide'],
  evidence_gaps: ['Starting point or education level was not provided.'],
  metadata: { status: 'deterministic', provider: 'deterministic', reason: 'ai_disabled', review_required: true },
}

const catalogMetadata = {
  schema_version: '1.0',
  title: 'OrQuest job-first occupation reference catalog',
  based_on: 'job_families_20.md',
  source_data_date_as_reported: '2026-11-07',
  provenance: 'Contributor-provided reference data',
  usage_notes: ['Browse by job family.'],
  sources: { national_wages: 'https://www.bls.gov/oes/tables.htm' },
  salary_scope: 'United States national figures; not Florida or Miami salaries.',
  verification_notice: 'Reference data; inspect verified_per_row.',
}
const catalogFamily = {
  id: 'family_01_computer_information_technology',
  name: 'Computer & Information Technology',
  ordinal: 1,
  bls_group_code: '15-1200',
  bls_group_title: 'Computer occupations',
  jobs_2025_thousands: 5036.2,
  median_wage_2025_usd: 109470,
  projected_growth_2025_2035_percent: 5.7,
  occupation_ids: ['occupation_15_1252'],
}
const catalogOccupation = {
  id: 'occupation_15_1252',
  family_id: catalogFamily.id,
  title: 'Software Developer',
  bls_title: 'Software developers',
  soc_code: '15-1252',
  onet_soc_code: '15-1252.00',
  summary: 'Design and build software.',
  national_wage_2025: { median_annual_usd: 133080, p10_annual_usd: 80000, p90_annual_usd: 211000 },
  entry_requirements_as_reported: "Bachelor's degree",
  projected_growth_2025_2035_percent: 16,
  projected_job_change_as_reported: '+267,700',
  source_refs: ['national_wages'],
  verified_per_row: false,
  verified_at: null,
}

let fetchMock
let careerQuestionResult
let careerRoadmapResult

beforeEach(() => {
  careerQuestionResult = questionResponse
  careerRoadmapResult = roadmapResponse
  fetchMock = vi.fn(async (url, options = {}) => {
    let body
    if (url.endsWith('/api/career-discovery/questions')) body = CAREER_DISCOVERY_BANK
    else if (url.endsWith('/api/career-discovery/matches')) body = { status: 'ready', matches, score_description: 'Interest alignment only.' }
    else if (url.endsWith('/api/cards')) body = { cards }
    else if (url.endsWith('/api/matches')) body = { status: 'ready', matches, score_description: 'Interest alignment only.' }
    else if (url.endsWith('/api/careers/career_software_developer')) body = career
    else if (url.endsWith('/api/careers/career_cybersecurity_analyst')) body = cybersecurityCareer
    else if (url.endsWith('/api/career-questions')) {
      const careerId = JSON.parse(options.body).career_id
      const discussedCareer = careerId === cybersecurityCareer.career_id ? cybersecurityCareer : career
      body = { ...careerQuestionResult, target_occupation: { career_id: discussedCareer.career_id, title: discussedCareer.title } }
    }
    else if (url.endsWith('/api/roadmaps')) {
      const requestedCareerId = JSON.parse(options.body).career_id
      const requestedCareer = matches.find(({ career_id }) => career_id === requestedCareerId) || matches[0]
      body = {
        ...careerRoadmapResult,
        target_occupation: { career_id: requestedCareer.career_id, title: requestedCareer.title },
      }
    }
    else if (url.endsWith('/api/job-families')) body = { families: [catalogFamily], metadata: catalogMetadata }
    else if (url.endsWith('/api/occupations')) body = { occupations: [catalogOccupation], metadata: catalogMetadata }
    else if (url.endsWith('/api/occupation-mappings')) body = {
      career_to_occupation: { career_software_developer: catalogOccupation.id },
      unmapped_career_ids: ['career_data_analyst'],
    }
    else return { ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) }
    return { ok: true, status: 200, json: async () => body }
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('career guidance API helpers', () => {
  it('loads the versioned Career Discovery bank and submits its structured answers to its matching endpoint', async () => {
    const bank = await getCareerDiscoveryQuestionBank()
    expect(bank.main_question_count).toBe(8)
    const discovery = {
      bank_version: bank.version,
      responses: [{ slot_id: 'education_status', question_id: 'education_status_v1', answer_type: 'single_choice', value: 'in_high_school' }],
    }
    expect(await getCareerDiscoveryMatches(discovery)).toEqual(matches)
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/career-discovery/matches'))
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual(discovery)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches'))).toBe(false)
  })

  it('posts only the explicit career and question and validates the question response', async () => {
    const result = await submitCareerQuestion({
      career_id: career.career_id,
      question: 'What should I learn?',
      questionnaire_answers: ['PRIVATE RPG ANSWER MUST NOT LEAK'],
      questionnaire_personalization_consent: true,
      preferences: ['inferred preference'],
      conversation_history: [{ role: 'user', content: 'earlier' }],
    })
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/career-questions'))
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ career_id: career.career_id, question: 'What should I learn?' })
    expect(call[1].body).not.toContain('PRIVATE RPG ANSWER MUST NOT LEAK')
    expect(result).toEqual(questionResponse)
  })

  it('posts only the active career and optional consented interest tags and validates the roadmap response', async () => {
    const result = await getCareerRoadmap({
      career_id: career.career_id,
      interest_tags: ['technology'],
      questionnaire_answers: ['private RPG answer'],
      questionnaire_personalization_consent: false,
      education_level: 'inferred',
      goals: ['inferred goal'],
    })
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/roadmaps'))
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({ career_id: career.career_id, interest_tags: ['technology'] })
    expect(result).toEqual(roadmapResponse)
  })

  it('sends only labeled, nonblank, mapped questionnaire answers to roadmaps with consent', async () => {
    await getCareerRoadmap({
      career_id: career.career_id,
      questionnaire_personalization_consent: true,
      questionnaire_answers: [
        'Build tools that help people.',
        'Music and biology.',
        'Recognition and achievement.',
        'Hands-on challenges.',
        'A stable, creative future.',
      ],
      education_level: 'must not be inferred',
      starting_point: 'must not be inferred',
    })

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/roadmaps'))
    expect(JSON.parse(call[1].body)).toEqual({
      career_id: career.career_id,
      goals: [
        'Career or future goal: Build tools that help people.',
        'Ideal future: A stable, creative future.',
      ],
      preferences: [
        'Interests, hobbies, and subjects: Music and biology.',
        'Preferred challenges and activities: Hands-on challenges.',
      ],
    })
    expect(call[1].body).not.toContain('Recognition and achievement')
  })

  it('omits blank questionnaire answers and rejects labeled answers over 1,000 characters before sending', async () => {
    await getCareerRoadmap({
      career_id: career.career_id,
      questionnaire_personalization_consent: true,
      questionnaire_answers: ['', '   ', 'motivation only', '', 'future'],
    })
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/roadmaps'))
    expect(JSON.parse(call[1].body)).toEqual({
      career_id: career.career_id,
      goals: ['Ideal future: future'],
    })

    fetchMock.mockClear()
    await expect(getCareerRoadmap({
      career_id: career.career_id,
      questionnaire_personalization_consent: true,
      questionnaire_answers: ['x'.repeat(1_000)],
    })).rejects.toMatchObject({ code: 'questionnaire_answer_too_long' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects malformed guidance responses with a typed API error', async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => ({ answer: 'missing required fields' }) }))
    await expect(submitCareerQuestion({ career_id: career.career_id, question: 'Question' }))
      .rejects.toMatchObject({ name: 'ApiError', code: 'unexpected_response' })
  })
})

function enterDemoCredentials() {
  fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
}

async function reachBubbleExplorer() {
  const save = createSaveFile({
    responses: cards.slice(0, 2).map((card) => ({ card_id: card.id, preference: 'like' })),
    exploredCareers: [],
    careerPaths: [],
    activeTargetCareer: null,
    personalizationConsents: initialPersonalizationConsents,
    quizAnswers: ['', '', '', '', ''],
  })
  fireEvent.change(document.querySelector('.save-file-input'), { target: { files: [makeImportFile(save)] } })
  await screen.findByText('Saved progress ready to import')
  fireEvent.click(screen.getByRole('button', { name: 'CONFIRM IMPORT' }))
  await screen.findByRole('button', { name: 'Software Developer' })
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/careers/career_software_developer'), expect.any(Object),
  ))
}

async function completeDiscoveryWithUndisclosedAnswers({ alreadyLoggedIn = false } = {}) {
  if (!alreadyLoggedIn) enterDemoCredentials()
  for (let number = 1; number <= 8; number += 1) {
    await screen.findByText(new RegExp(`MAIN QUESTION ${number} OF 8`))
    const undisclosedOption = screen.queryByText('I prefer not to say')
    if (undisclosedOption) fireEvent.click(undisclosedOption)
    else fireEvent.click(screen.getByRole('button', { name: /prefer not to say/i }))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  }
  await screen.findByRole('heading', { name: 'Bubble Explorer' })
}

async function enterRpgWithSoftwareTarget({ quizAnswer } = {}) {
  await reachBubbleExplorer()
  fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
  await screen.findByText(career.summary)
  fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
  if (quizAnswer) {
    fireEvent.change(screen.getByLabelText(/what kind of future or career/i), { target: { value: quizAnswer } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
  fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
  await screen.findByRole('main', { name: 'Career progression game' })
}

function makeImportFile(save) {
  const content = JSON.stringify(save)
  const file = new File([content], 'orquest-save.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => content })
  return file
}

function readBlobText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

describe('Login → adaptive eight-question Career Discovery → Bubble Explorer', () => {
  it('enters as a guest without account credentials', async () => {
    render(<App />)
    expect(screen.queryByLabelText('Username')).toBeNull()
    expect(screen.queryByLabelText('Password')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
    expect(await screen.findByRole('heading', { name: /which option best describes your education right now/i })).toBeTruthy()
  })

  it('validates and confirms a save import, restores multiple paths, and switches the active path', async () => {
    const importedPaths = matches.map(({ career_id, title, matched_interest_tags }) => ({
      career_id,
      title,
      matched_interest_tags,
    }))
    const save = createSaveFile({
      responses: cards.slice(0, 3).map((card, index) => ({ card_id: card.id, preference: index ? 'dislike' : 'like' })),
      exploredCareers: [{ career_id: importedPaths[1].career_id }],
      careerPaths: importedPaths,
      activeTargetCareer: importedPaths[0],
      personalizationConsents: { quiz: true, swipes: false },
      quizAnswers: ['Saved RPG context', '', '', '', ''],
      exportedAt: '2026-11-07T12:00:00.000Z',
    })
    render(<App />)
    expect(screen.getByRole('button', { name: /start fresh \/ enter the hall/i })).toBeTruthy()
    fireEvent.change(document.querySelector('.save-file-input'), { target: { files: [makeImportFile(save)] } })

    expect(await screen.findByText('Saved progress ready to import')).toBeTruthy()
    expect(screen.getByText('3 swipe responses')).toBeTruthy()
    expect(screen.getByText('2 saved career paths')).toBeTruthy()
    expect(screen.getByText('1 non-empty questionnaire answers saved with consent')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM IMPORT' }))
    expect(await screen.findByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/matches'),
      expect.objectContaining({ body: JSON.stringify({ responses: save.data.swipe_responses }) }),
    ))
    expect(document.querySelector('.guide-active-target').textContent).toContain('Software Developer')

    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByLabelText(/what kind of future or career/i).value).toBe('Saved RPG context')
    for (let index = 0; index < 5; index += 1) {
      if (index > 0) fireEvent.change(screen.getByRole('textbox'), { target: { value: `Saved answer ${index + 1}` } })
      fireEvent.click(screen.getByRole('button', { name: index === 4 ? /CONTINUE.*SHARING|CONTINUE WITH RPG PERSONALIZATION/ : /^NEXT$/i }))
    }
    expect(await screen.findByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
    expect(document.querySelector('.journey-path-card strong').textContent).toBe('Software Developer')
    fireEvent.click(screen.getByRole('button', { name: /Cybersecurity Analyst.*SET ACTIVE TARGET/i }))
    expect(document.querySelector('.journey-path-card strong').textContent).toBe('Cybersecurity Analyst')
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(document.querySelector('.rpg-card .journey-path-card strong').textContent).toBe('Cybersecurity Analyst')
    fireEvent.click(screen.getByRole('button', { name: /Software Developer.*SET ACTIVE TARGET/i }))
    expect(document.querySelector('.rpg-card .journey-path-card strong').textContent).toBe('Software Developer')
    fireEvent.click(screen.getByRole('button', { name: /request career roadmap/i }))
    expect(await screen.findByRole('heading', { name: 'Roadmap for Software Developer' })).toBeTruthy()
    const roadmapCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/roadmaps'))
    expect(JSON.parse(roadmapCall[1].body)).toEqual({
      career_id: career.career_id,
      goals: [
        'Career or future goal: Saved RPG context',
        'Ideal future: Saved answer 5',
      ],
      preferences: [
        'Interests, hobbies, and subjects: Saved answer 2',
        'Preferred challenges and activities: Saved answer 4',
      ],
    })
    expect(roadmapCall[1].body).not.toContain('Saved answer 3')
  })

  it('reports a corrupted or incompatible save without loading it', async () => {
    render(<App />)
    fireEvent.change(document.querySelector('.save-file-input'), {
      target: { files: [makeImportFile({ not: 'an Orquest save' })] },
    })
    expect((await screen.findByRole('alert')).textContent).toMatch(/not an Orquest/i)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches'))).toBe(false)
  })

  it('clears saved questionnaire consent and answers when the entire quiz is skipped', async () => {
    const careerPath = {
      career_id: career.career_id,
      title: career.title,
      matched_interest_tags: ['technology'],
    }
    const save = createSaveFile({
      responses: [{ card_id: cards[0].id, preference: 'like' }],
      exploredCareers: [],
      careerPaths: [careerPath],
      activeTargetCareer: careerPath,
      personalizationConsents: { quiz: true, swipes: true },
      quizAnswers: ['Previously consented answer', '', '', '', ''],
    })
    render(<App />)
    fireEvent.change(document.querySelector('.save-file-input'), { target: { files: [makeImportFile(save)] } })
    await screen.findByText('Saved progress ready to import')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM IMPORT' }))
    await screen.findByRole('heading', { name: 'Bubble Explorer' })
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByLabelText(/what kind of future or career/i).value).toBe('Previously consented answer')
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))

    const createObjectURL = vi.fn(() => 'blob:orquest-save')
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'EXPORT SAVED PROGRESS' }))
    const exportedText = await readBlobText(createObjectURL.mock.calls[0][0])
    const exportedSave = JSON.parse(exportedText)
    expect(exportedSave.data.personalization_consents.quiz).toBe(false)
    expect(exportedSave.data).not.toHaveProperty('questionnaire_answers')
  })

  it('exports the current demo state as a JSON Blob', async () => {
    const createObjectURL = vi.fn(() => 'blob:orquest-save')
    const revokeObjectURL = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Export saved progress' }))
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(anchorClick).toHaveBeenCalled()
  })

  it('starts the approved bank at main question 1 of 8 without calling legacy matching', async () => {
    render(<App />)
    enterDemoCredentials()
    expect(await screen.findByRole('heading', { name: /which option best describes your education right now/i })).toBeTruthy()
    expect(screen.getByText(/MAIN QUESTION 1 OF 8/i)).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/cards'))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches'))).toBe(false)
  })

  it('lets a student skip Career Discovery and opens the career-field catalog without creating survey answers', async () => {
    render(<App />)
    enterDemoCredentials()
    expect(await screen.findByText(/MAIN QUESTION 1 OF 8/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /skip questionnaire.*explore careers/i }))

    expect(await screen.findByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Explore Engineering & Technology career field' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'CAREER CATALOG' }).getAttribute('aria-pressed')).toBe('true')
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/career-discovery/matches'))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches'))).toBe(false)
  })

  it('adapts an approved question variant from prior answers and keeps follow-up progress on the same slot', async () => {
    render(<App />)
    enterDemoCredentials()
    await screen.findByText(/MAIN QUESTION 1 OF 8/i)
    fireEvent.click(screen.getByLabelText('I am in high school'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/MAIN QUESTION 2 OF 8/i)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Math and numbers'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText(/MAIN QUESTION 2 OF 8 \/ OPTIONAL FOLLOW-UP/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: /is there a subject, hobby, or topic/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /skip this follow-up/i }))

    expect(await screen.findByRole('heading', { level: 1, name: /i enjoy investigating how a system works/i })).toBeTruthy()
    expect(screen.getByText(/MAIN QUESTION 3 OF 8/i)).toBeTruthy()
    expect(screen.getByText(/follow-ups do not change main progress/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }))
    expect(await screen.findByText(/MAIN QUESTION 3 OF 8 \/ OPTIONAL FOLLOW-UP/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /skip this follow-up/i }))
    expect(await screen.findByRole('heading', { name: /how do you usually prefer to learn/i })).toBeTruthy()
  })

  it('collects exactly eight main answers, enters Bubble Explorer, and skips legacy matching', async () => {
    render(<App />)
    enterDemoCredentials()
    for (let number = 1; number <= 8; number += 1) {
      expect(await screen.findByText(new RegExp(`MAIN QUESTION ${number} OF 8`))).toBeTruthy()
      fireEvent.click(screen.getByText('I prefer not to say'))
      fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    }

    expect(await screen.findByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    const discoveryRequest = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/career-discovery/matches'))
    expect(JSON.parse(discoveryRequest[1].body).responses).toHaveLength(8)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches'))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/cards'))).toBe(false)
  })

  it('carries consented discovery matching tags into RPG roadmap guidance', async () => {
    render(<App />)
    enterDemoCredentials()
    await screen.findByText(/MAIN QUESTION 1 OF 8/i)
    const consent = screen.getByLabelText(/allow AI to analyze my responses to personalize my RPG experience/i)
    expect(consent.checked).toBe(false)
    fireEvent.click(consent)
    await completeDiscoveryWithUndisclosedAnswers({ alreadyLoggedIn: true })
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    await screen.findByText(career.summary)
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    fireEvent.click(screen.getByRole('button', { name: /request career roadmap/i }))
    await screen.findByRole('heading', { name: 'Roadmap for Software Developer' })
    const roadmapCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/roadmaps'))
    expect(JSON.parse(roadmapCall[1].body)).toEqual({
      career_id: career.career_id,
      interest_tags: ['technology', 'problem_solving'],
    })
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/matches'))).toBe(false)
  })

  it('loads saved matching results, with search in the top header', async () => {
    render(<App />)
    await reachBubbleExplorer()
    expect(screen.getByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    expect(screen.getByLabelText('Search careers, fields, or pathways...')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Software Developer' })).toBeTruthy()
    expect(screen.queryByText(/ORQUEST ORBIT/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Toggle technology' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle problem solving' })).toBeTruthy()

    const technologyFilter = screen.getByRole('button', { name: 'Toggle technology' })
    fireEvent.click(technologyFilter)
    expect(technologyFilter.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Software Developer' }).className).toContain('is-muted')
    fireEvent.click(technologyFilter)
    expect(technologyFilter.getAttribute('aria-pressed')).toBe('true')

    fireEvent.change(screen.getByLabelText('Search careers, fields, or pathways...'), { target: { value: 'developer' } })
    expect(screen.getByRole('button', { name: 'Software Developer' }).className).toContain('is-search-match')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByLabelText('Search careers, fields, or pathways...').value).toBe('')
  })

  it('keeps swipe, chat, and quiz personalization consent independent', () => {
    const withSwipeConsent = setPersonalizationConsent(initialPersonalizationConsents, 'swipes', true)
    expect(withSwipeConsent).toEqual({ quiz: false, swipes: true, careerChat: false })

    const withChatConsent = setPersonalizationConsent(withSwipeConsent, 'careerChat', true)
    expect(withChatConsent).toEqual({ quiz: false, swipes: true, careerChat: true })

    const withQuizConsent = grantQuizPersonalizationConsent(withChatConsent)
    expect(withQuizConsent).toEqual({ quiz: true, swipes: true, careerChat: true })
    expect(setPersonalizationConsent(withQuizConsent, 'swipes', false)).toEqual({
      quiz: true,
      swipes: false,
      careerChat: true,
    })
  })

  it('opens a backend summary on single-click and closes it', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    expect(await screen.findByText(career.summary)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Software Developer' })).toBeTruthy()
    expect(screen.getByLabelText('Ask a question about this career')).toBeTruthy()

    const requestCount = fetchMock.mock.calls.length
    fireEvent.change(screen.getByLabelText('Ask a question about this career'), { target: { value: 'What should I learn?' } })
    expect(fetchMock).toHaveBeenCalledTimes(requestCount)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/ai'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Close career summary' }))
    expect(screen.queryByText(career.summary)).toBeNull()
  })

  it('submits career chat only on Send, for the discussed career, without history or quiz context', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    await screen.findByText(career.summary)
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity Analyst' }))
    await screen.findByText(cybersecurityCareer.summary)
    fireEvent.change(screen.getByLabelText('Ask a question about this career'), {
      target: { value: 'What should I learn first?' },
    })
    const callsBeforeOpen = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))

    const chat = await screen.findByRole('dialog', { name: 'Ask about Cybersecurity Analyst' })
    expect(chat.textContent).toContain('Questions are sent only when you press Send.')
    expect(chat.textContent).toContain('What should I learn first?')
    expect(screen.getByRole('button', { name: 'Send question' }).disabled).toBe(false)
    const chatConsent = screen.getByLabelText(/allow AI to analyze my career chat conversations/i)
    expect(chatConsent.checked).toBe(false)
    fireEvent.click(chatConsent)

    const arrow = document.querySelector('.career-chat-arrow.is-expanded')
    expect(arrow.className).toContain('is-expanded')
    expect(styles).toMatch(/\.career-chat-arrow\.is-expanded\s*\{[^}]*transform:\s*rotate\(180deg\)/)
    expect(styles).toMatch(/\.career-chat-arrow\s*\{[^}]*transform:\s*rotate\(0deg\)/)
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeOpen)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse career chat' }))
    const collapsedArrow = document.querySelector('.career-chat-dock .career-chat-arrow')
    expect(collapsedArrow).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand career chat' }))
    expect(screen.getByRole('dialog', { name: 'Ask about Cybersecurity Analyst' }).textContent).toContain('What should I learn first?')
    expect(screen.getByLabelText(/allow AI to analyze my career chat conversations/i).checked).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeOpen)

    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    expect(await screen.findByText(questionResponse.answer)).toBeTruthy()
    const questionCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/career-questions'))
    expect(JSON.parse(questionCall[1].body)).toEqual({
      career_id: cybersecurityCareer.career_id,
      question: 'What should I learn first?',
    })
    expect(document.querySelector('.guide-active-target').textContent).toContain('Software Developer')
  })

  it('hides the answer and sources returned with a blocked chat response', async () => {
    careerQuestionResult = {
      ...questionResponse,
      answer: 'MUST NOT BE DISPLAYED',
      source_urls: ['https://example.org/blocked-source'],
      resource_ids: ['blocked_resource'],
      metadata: { status: 'blocked', provider: 'none', reason: 'safety_refusal', review_required: true },
    }
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    await screen.findByText(career.summary)
    fireEvent.change(screen.getByLabelText('Ask a question about this career'), { target: { value: 'Can you help?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText('A response is unavailable for this question.')).toBeTruthy()
    expect(screen.queryByText('MUST NOT BE DISPLAYED')).toBeNull()
    expect(screen.queryByText('https://example.org/blocked-source')).toBeNull()
  })

  it('requires an explicitly selected RPG target before requesting a roadmap', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(screen.getByText('No target selected yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: /request career roadmap/i }).disabled).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/roadmaps'))).toBe(false)
  })

  it('keeps exploration separate from the active goal, excludes skipped quiz answers, and renders draft steps once', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    await screen.findByText(career.summary)
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))

    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity Analyst' }))
    await screen.findByText(cybersecurityCareer.summary)
    expect(document.querySelector('.guide-active-target').textContent).toContain('Software Developer')

    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    fireEvent.change(screen.getByLabelText(/what kind of future or career/i), { target: { value: 'QUIZ ANSWER MUST NOT BE SENT' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
    expect(document.querySelector('.journey-path-card strong').textContent).toBe('Software Developer')
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    fireEvent.click(screen.getByRole('button', { name: /request career roadmap/i }))

    expect(await screen.findByRole('heading', { name: 'Roadmap for Software Developer' })).toBeTruthy()
    expect(screen.getByText('DETERMINISTIC CATALOG GUIDANCE')).toBeTruthy()
    expect(screen.getAllByText(roadmapStep.title)).toHaveLength(1)
    expect(screen.getByText(/not active RPG missions/i)).toBeTruthy()
    expect(document.querySelector('.roadmap-panel').textContent).not.toMatch(/XP|mission complete|completed mission/i)

    const roadmapCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/roadmaps'))
    expect(JSON.parse(roadmapCall[1].body)).toEqual({ career_id: career.career_id })
    expect(roadmapCall[1].body).not.toContain('QUIZ ANSWER MUST NOT BE SENT')
    expect(roadmapCall[1].body).not.toContain('career_cybersecurity_analyst')
  })

  it('personalizes only the active career roadmap with labeled consented answers and keeps saved paths', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    await screen.findByText(career.summary)
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity Analyst' }))
    await screen.findByText(cybersecurityCareer.summary)
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))

    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    const answers = [
      'Build secure tools.',
      'Networks and puzzles.',
      'Recognition.',
      'Investigative challenges.',
      'Meaningful technical work.',
    ]
    for (let index = 0; index < answers.length; index += 1) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: answers[index] } })
      fireEvent.click(screen.getByRole('button', { name: index === answers.length - 1 ? /CONTINUE.*SHARING|CONTINUE WITH RPG PERSONALIZATION/ : /^NEXT$/i }))
    }
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(screen.getAllByText('Software Developer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cybersecurity Analyst').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /request career roadmap/i }))

    await screen.findByRole('heading', { name: 'Roadmap for Cybersecurity Analyst' })
    const roadmapCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/roadmaps'))
    expect(JSON.parse(roadmapCall[1].body)).toEqual({
      career_id: cybersecurityCareer.career_id,
      goals: [
        'Career or future goal: Build secure tools.',
        'Ideal future: Meaningful technical work.',
      ],
      preferences: [
        'Interests, hobbies, and subjects: Networks and puzzles.',
        'Preferred challenges and activities: Investigative challenges.',
      ],
    })
    expect(roadmapCall[1].body).not.toContain('Recognition.')
    expect(roadmapCall[1].body).not.toMatch(/education_level|starting_point/)
  })

  it('shows a length validation error and does not request a roadmap for an over-limit labeled answer', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    await screen.findByText(career.summary)
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x'.repeat(1_000) } })
    fireEvent.click(screen.getByRole('button', { name: /^NEXT$/i }))
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Skip Question' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    fireEvent.click(screen.getByRole('button', { name: /request career roadmap/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/1,000-character limit/)
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/roadmaps'))).toBe(false)
    expect(screen.getAllByText('Software Developer').length).toBeGreaterThan(0)
  })

  it('labels AI roadmap results as drafts and suppresses blocked roadmap content', async () => {
    careerRoadmapResult = {
      ...roadmapResponse,
      metadata: { status: 'ai_generated', provider: 'gemini', reason: null, review_required: true },
    }
    render(<App />)
    await enterRpgWithSoftwareTarget()
    fireEvent.click(screen.getByRole('button', { name: /request career roadmap/i }))
    expect(await screen.findByText('AI-GENERATED DRAFT / REVIEW REQUIRED')).toBeTruthy()
    expect(screen.getAllByText(roadmapStep.title)).toHaveLength(1)

    cleanup()
    careerRoadmapResult = {
      ...roadmapResponse,
      relevant_skills_and_qualifications: ['BLOCKED SKILL MUST NOT SHOW'],
      alternative_resources: [{ ...roadmapResponse.alternative_resources[0], title: 'BLOCKED RESOURCE MUST NOT SHOW' }],
      suggested_missions: [{ ...roadmapStep, title: 'BLOCKED STEP MUST NOT SHOW' }],
      source_urls: ['https://example.org/blocked-roadmap-source'],
      evidence_gaps: ['BLOCKED GAP MUST NOT SHOW'],
      metadata: { status: 'blocked', provider: 'none', reason: 'safety_refusal', review_required: true },
    }
    render(<App />)
    await enterRpgWithSoftwareTarget()
    fireEvent.click(screen.getByRole('button', { name: /request career roadmap/i }))
    expect(await screen.findByText(/could not safely provide roadmap suggestions/i)).toBeTruthy()
    expect(screen.queryByText('BLOCKED SKILL MUST NOT SHOW')).toBeNull()
    expect(screen.queryByText('BLOCKED RESOURCE MUST NOT SHOW')).toBeNull()
    expect(screen.queryByText('BLOCKED STEP MUST NOT SHOW')).toBeNull()
    expect(screen.queryByText('BLOCKED GAP MUST NOT SHOW')).toBeNull()
    expect(screen.queryByText('https://example.org/blocked-roadmap-source')).toBeNull()
  })

  it('places the chat overlay above an open detailed career view', async () => {
    render(<App />)
    await reachBubbleExplorer()
    const careerBubble = screen.getByRole('button', { name: 'Software Developer' })
    fireEvent.click(careerBubble)
    fireEvent.doubleClick(careerBubble)
    await screen.findByRole('dialog', { name: 'Software Developer' })

    fireEvent.change(screen.getByLabelText('Ask a question about this career'), {
      target: { value: 'Which skills matter?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open career chat' }))
    await screen.findByRole('dialog', { name: 'Ask about Software Developer' })

    const detailBackdrop = document.querySelector('.career-detail-backdrop')
    const chatBackdrop = document.querySelector('.career-chat-backdrop')
    expect(styles).toMatch(/\.career-chat-backdrop\s*\{[^}]*z-index:\s*50/)
    expect(styles).toMatch(/\.career-detail-backdrop\s*\{[^}]*z-index:\s*20/)
    expect(detailBackdrop.getAttribute('aria-hidden')).toBe('true')
  })

  it('opens details on bubble or summary double-click and returns to the summary', async () => {
    render(<App />)
    await reachBubbleExplorer()
    const careerBubble = screen.getByRole('button', { name: 'Software Developer' })
    fireEvent.click(careerBubble)
    fireEvent.click(careerBubble)
    fireEvent.doubleClick(careerBubble)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(document.querySelector('.map-summary')).toBeNull()
    expect(screen.getByText('Knowledge of programming languages')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Career description' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to summary' }))
    expect(screen.getByText(career.summary)).toBeTruthy()

    fireEvent.doubleClick(screen.getByText(career.summary))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close career details' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('collapses and restores the Field Guide', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Field Guide' }))
    expect(screen.getByRole('button', { name: 'Expand Field Guide' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Field Guide' }))
    expect(screen.getByRole('button', { name: 'Collapse Field Guide' })).toBeTruthy()
  })

  it('preserves the map and quiz answers through the optional journey flow without changing backend calls', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Software Developer' }))
    expect(await screen.findByText(career.summary)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE THIS AS MY GOAL' }))

    const backendCallsBeforeQuiz = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    expect(screen.getByText('Personalization Notice')).toBeTruthy()
    const answerBox = screen.getByLabelText(/what kind of future or career/i)
    fireEvent.change(answerBox, { target: { value: 'Build tools that help people.' } })
    fireEvent.click(screen.getByRole('button', { name: /^NEXT$/i }))
    expect(screen.getByText('Question 2 of 5')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByLabelText(/what kind of future or career/i).value).toBe('Build tools that help people.')

    fireEvent.click(screen.getByRole('button', { name: /back to bubble explorer/i }))
    expect(screen.getByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByLabelText(/what kind of future or career/i).value).toBe('Build tools that help people.')
    fireEvent.click(screen.getByRole('button', { name: 'Skip Quiz' }))
    expect(screen.getByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
    expect(document.querySelector('.journey-path-card strong').textContent).toBe('Software Developer')
    expect(fetchMock).toHaveBeenCalledTimes(backendCallsBeforeQuiz)
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(screen.getByRole('main', { name: 'Career progression game' })).toBeTruthy()
    expect(document.querySelector('.rpg-card .journey-path-card strong').textContent).toBe('Software Developer')
    fireEvent.click(screen.getByRole('button', { name: /return to bubble explorer/i }))
    expect(screen.getByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    expect(screen.getByText(career.summary)).toBeTruthy()
  })

  it('lets the student skip questions through the final step and continue', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    for (let question = 1; question < 5; question += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Skip Question' }))
      expect(screen.getByText(`Question ${question + 1} of 5`)).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
  })

  it('finishes after answering the fifth question and opens roadmap guidance without inventing missions', async () => {
    render(<App />)
    await reachBubbleExplorer()
    fireEvent.click(screen.getByRole('button', { name: 'Enter RPG' }))
    for (let index = 0; index < 5; index += 1) {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: `Answer ${index + 1}` } })
      fireEvent.click(screen.getByRole('button', { name: index === 4 ? /CONTINUE.*SHARING|CONTINUE WITH RPG PERSONALIZATION/ : /^NEXT$/i }))
    }
    expect(screen.getByRole('heading', { name: 'Ready when you are.' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /start your journey/i }))
    expect(screen.getByRole('main', { name: 'Career progression game' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Roadmap guidance' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /request career roadmap/i }).disabled).toBe(true)
  })
})
