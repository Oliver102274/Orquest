import { useEffect, useMemo, useRef, useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import CareerChatOverlay from './CareerChatOverlay.jsx'
import { getCareer, getCareerMatches, submitCareerQuestion } from '../services/api.js'
import { getJobFamilies, getOccupations, getOccupationDetail, getOccupationMappings, getOccupationRoadmap, getOccupationResources } from '../services/catalogApi.js'
import { buildCareerFieldGroups, careerFieldForFamily } from '../data/careerFieldCategories.js'
import jobCatalogSnapshot from '../data/jobCatalogSnapshot.json'
import './BubbleExplorerExperience.css'

const TAG_COLORS = ['#91c6a0', '#8fb7cf', '#b99bd3', '#d39bb8', '#d6b887', '#94c2c5', '#b4c68c', '#a3a6d5']

// These are the only explicit legacy career-to-occupation mappings in the
// current backend. Keep them as a safe fallback if the optional mapping route
// is unavailable; never infer a mapping for Data Analyst.
const KNOWN_OCCUPATION_MAPPINGS = {
  career_to_occupation: {
    career_software_developer: 'occupation_15_1252',
    career_cybersecurity_analyst: 'occupation_15_1212',
  },
  unmapped_career_ids: ['career_data_analyst'],
}

const BUNDLED_CATALOG_METADATA = {
  schema_version: jobCatalogSnapshot.schema_version,
  title: jobCatalogSnapshot.title,
  based_on: jobCatalogSnapshot.based_on,
  source_data_date_as_reported: jobCatalogSnapshot.source_data_date_as_reported,
  provenance: jobCatalogSnapshot.provenance,
  usage_notes: jobCatalogSnapshot.usage_notes,
  sources: jobCatalogSnapshot.sources,
  salary_scope: 'United States national figures; not Florida or Miami salaries.',
  verification_notice: 'Reference data; inspect verified_per_row. Typical education is descriptive, not a universal employment or licensing requirement.',
}

function colorForTag(tag = '', palette = null) {
  if (palette?.has(tag)) return palette.get(tag)
  let hash = 0
  for (const character of tag) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return TAG_COLORS[hash % TAG_COLORS.length]
}

function formatTag(tag = '') {
  return tag.replaceAll('_', ' ')
}

function matchTags(match) {
  return Array.isArray(match.matched_interest_tags) ? match.matched_interest_tags : []
}

function primaryTag(match) {
  return matchTags(match)[0] || ''
}

function layoutMatches(matches) {
  const count = matches.length
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * 1.55)))
  const rows = Math.max(1, Math.ceil(count / columns))
  const densityScale = count > 20 ? 0.58 : count > 12 ? 0.76 : count > 7 ? 0.88 : 1
  return new Map(matches.map((match, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return [match.career_id, {
      x: 8 + ((column + 0.5) / columns) * 84,
      y: 10 + ((row + 0.5) / rows) * 76,
      size: Math.round(Math.min(104, Math.max(70, 70 + match.interest_score * 0.34)) * densityScale),
    }]
  }))
}

const FIELD_NODE_POSITIONS_DESKTOP = [
  { x: 12, y: 20 }, { x: 38, y: 20 }, { x: 64, y: 20 }, { x: 88, y: 20 },
  { x: 17, y: 50 }, { x: 50, y: 50 }, { x: 83, y: 50 },
  { x: 13, y: 80 }, { x: 42, y: 80 }, { x: 70, y: 80 },
]

const FIELD_NODE_POSITIONS_TABLET = [
  { x: 16, y: 15 }, { x: 50, y: 15 }, { x: 84, y: 15 },
  { x: 16, y: 38 }, { x: 50, y: 38 }, { x: 84, y: 38 },
  { x: 16, y: 62 }, { x: 50, y: 62 }, { x: 84, y: 62 },
  { x: 50, y: 85 },
]

const FIELD_NODE_POSITIONS_MOBILE = [
  { x: 29, y: 12 }, { x: 71, y: 12 },
  { x: 29, y: 31 }, { x: 71, y: 31 },
  { x: 29, y: 50 }, { x: 71, y: 50 },
  { x: 29, y: 69 }, { x: 71, y: 69 },
  { x: 29, y: 88 }, { x: 71, y: 88 },
]

const RADIAL_NODE_POSITIONS = {
  1: [{ x: 50, y: 15 }],
  2: [{ x: 22, y: 50 }, { x: 78, y: 50 }],
  3: [{ x: 50, y: 14 }, { x: 19, y: 79 }, { x: 81, y: 79 }],
  4: [{ x: 50, y: 13 }, { x: 84, y: 50 }, { x: 50, y: 87 }, { x: 16, y: 50 }],
  5: [{ x: 50, y: 13 }, { x: 84, y: 36 }, { x: 71, y: 81 }, { x: 29, y: 81 }, { x: 16, y: 36 }],
  6: [{ x: 50, y: 12 }, { x: 83, y: 34 }, { x: 83, y: 69 }, { x: 50, y: 88 }, { x: 17, y: 69 }, { x: 17, y: 34 }],
}

export function layoutCatalogBubbles(items, nodeType, viewportWidth = 1280) {
  if (nodeType === 'field') {
    const fieldPositions = viewportWidth <= 700
      ? FIELD_NODE_POSITIONS_MOBILE
      : viewportWidth <= 980
        ? FIELD_NODE_POSITIONS_TABLET
        : FIELD_NODE_POSITIONS_DESKTOP
    const size = viewportWidth <= 700 ? 58 : viewportWidth <= 980 ? 82 : 96
    return new Map(items.map((item, index) => [
      item.id,
      {
        ...(fieldPositions[index] || {
          x: 50 + Math.cos((-Math.PI / 2) + (Math.PI * 2 * index) / items.length) * 40,
          y: 50 + Math.sin((-Math.PI / 2) + (Math.PI * 2 * index) / items.length) * 38,
        }),
        size: Math.min(viewportWidth <= 700 ? 64 : viewportWidth <= 980 ? 92 : 124,
          size + Math.round(Math.sqrt(item.occupationCount || 1) * (viewportWidth <= 700 ? 1 : 2))),
      },
    ]))
  }

  const count = items.length
  if (count > 8) {
    return layoutMatches(items.map((item) => ({
      career_id: item.id,
      title: item.title || item.name,
      interest_score: 0,
    })))
  }

  const positions = RADIAL_NODE_POSITIONS[count] || items.map((_, index) => ({
    x: 50 + Math.cos((-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(count, 1)) * 38,
    y: 50 + Math.sin((-Math.PI / 2) + (Math.PI * 2 * index) / Math.max(count, 1)) * 38,
  }))
  const size = nodeType === 'family'
    ? (viewportWidth <= 700 ? 54 : viewportWidth <= 980 ? 62 : 70)
    : (viewportWidth <= 700 ? 52 : viewportWidth <= 980 ? 64 : 76)

  return new Map(items.map((item, index) => [
    item.id,
    { ...positions[index], size },
  ]))
}

function matchesSearch(match, detail, query) {
  if (!query) return true
  const searchable = [
    match.title,
    match.rationale,
    ...matchTags(match),
    detail?.summary,
    ...(detail?.requirements || []),
    ...(detail?.sources || []).map((source) => source.title),
    ...(detail?.mdc_resources || []).map((resource) => resource.title),
    ...(detail?.external_resources || []).map((resource) => resource.title),
  ].filter(Boolean).join(' ').toLowerCase()
  return searchable.includes(query)
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  )
}

function QuestionPlaceholder({ onOpenChat }) {
  const [question, setQuestion] = useState('')

  function submitQuestion(event) {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) return
    onOpenChat(trimmedQuestion)
    setQuestion('')
  }

  return (
    <form className="career-question-placeholder" onSubmit={submitQuestion}>
      <span aria-hidden="true">?</span>
      <input
        type="text"
        aria-label="Ask a question about this career"
        placeholder="Ask a question about this career..."
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <button type="submit" aria-label="Open career chat" disabled={!question.trim()}>↗</button>
    </form>
  )
}

function ResourceList({ title, resources }) {
  if (!resources?.length) return null
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <ul>
        {resources.map((resource) => (
          <li key={resource.id}>
            <strong>{resource.title}</strong>
            <span>{resource.organization} · {resource.type}</span>
            {resource.source_url && (
              <a href={resource.source_url} target="_blank" rel="noreferrer">Open source</a>
            )}
            <small>{resource.verification_status}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CatalogOccupationDetails({
  occupation,
  detail,
  metadata,
  loading,
  error,
  resources,
  resourcesLoading,
  resourcesError,
  mdcResources,
  mdcLoading,
  mdcError,
  onRetryMdc,
  activeTargetCareer,
  onChooseGoal,
  onOpenChat,
  onRetry,
  onRetryResources,
}) {
  if (error && !occupation) {
    return <div className="detail-load-error" role="alert">
      <p>Occupation details could not be loaded: {error}</p>
      <button type="button" className="pixel-button" onClick={onRetry}>RETRY DETAILS</button>
    </div>
  }
  if (!occupation) return <p role="status">LOADING OCCUPATION DETAILS…</p>

  const money = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
  const sources = occupation.source_refs.map((reference) => ({
    reference,
    url: metadata?.sources?.[reference],
  }))

  return (
    <>
      <div className={`catalog-verification-notice ${occupation.verified_per_row ? 'is-verified' : 'is-unverified'}`}>
        <strong>{occupation.verified_per_row ? 'ROW-LEVEL VERIFIED' : 'UNVERIFIED REFERENCE DATA'}</strong>
        <p>{metadata?.verification_notice || 'Check the row-level verification status before relying on this reference.'}</p>
        <p>{metadata?.salary_scope || 'Wage figures are national estimates, not local salary promises.'}</p>
      </div>
      <p className="detail-tags">SOC {occupation.soc_code} · O*NET {occupation.onet_soc_code}</p>
      <button
        className={`career-target-button ${activeTargetCareer?.career_id === occupation.id ? 'is-active' : ''}`}
        type="button"
        disabled={activeTargetCareer?.career_id === occupation.id}
        onClick={onChooseGoal}
      >
        {activeTargetCareer?.career_id === occupation.id ? 'ACTIVE RPG GOAL' : 'CHOOSE THIS AS MY GOAL'}
      </button>
      <section className="detail-section">
        <h3>Occupation description</h3>
        <p>{occupation.summary}</p>
        <p className="catalog-secondary-copy">BLS title: {occupation.bls_title}</p>
      </section>
      <section className="detail-section">
        <h3>National wage reference · 2025</h3>
        <div className="catalog-wage-grid">
          <div><small>10TH PERCENTILE</small><strong>{money(occupation.national_wage_2025.p10_annual_usd)}</strong></div>
          <div><small>MEDIAN</small><strong>{money(occupation.national_wage_2025.median_annual_usd)}</strong></div>
          <div><small>90TH PERCENTILE</small><strong>{money(occupation.national_wage_2025.p90_annual_usd)}</strong></div>
        </div>
        <p className="catalog-secondary-copy">{metadata?.salary_scope}</p>
      </section>
      <section className="detail-section">
        <h3>Typical entry requirements as reported</h3>
        <p>{occupation.entry_requirements_as_reported}</p>
        <p className="catalog-secondary-copy">Typical education is descriptive, not a universal degree, employment, or licensing requirement.</p>
      </section>
      <section className="detail-section">
        <h3>Employment outlook · 2025–2035</h3>
        <p>Projected growth: {occupation.projected_growth_2025_2035_percent}%</p>
        <p>{occupation.projected_job_change_as_reported}</p>
      </section>
      <section className="detail-section educational-resources-section">
        <h3>Educational Resources</h3>
        <p className="catalog-secondary-copy">
          Explore available learning options. A listed resource is not automatically a required credential or qualification.
        </p>
        {resourcesLoading && <p role="status">LOADING EDUCATIONAL RESOURCES…</p>}
        {resourcesError && (
          <div className="catalog-detail-load-note" role="status">
            Educational resources could not be loaded: {resourcesError}
            <button type="button" onClick={onRetryResources}>RETRY RESOURCES</button>
          </div>
        )}
        {!resourcesLoading && !resourcesError && (
          <>
            {[
              { title: 'Miami Dade College', items: resources?.mdc_pathways || [] },
              { title: 'Alternative Education & Training', items: resources?.alternative_resources || [] },
            ].map((group) => (
              <div className="catalog-resource-group" key={group.title}>
                <h4>{group.title}</h4>
                {group.items.length ? (
                  <ul>
                    {group.items.map((resource) => (
                      <li key={resource.id}>
                        <strong>{resource.title}</strong>
                        <span>{resource.organization} · {resource.type}</span>
                        <small className={`resource-verification is-${resource.verification_status}`}>
                          {resource.verification_status.replaceAll('_', ' ').toUpperCase()}
                        </small>
                        {resource.source_url
                          ? <a href={resource.source_url} target="_blank" rel="noreferrer">Open resource</a>
                          : <small>Provider URL not supplied.</small>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="catalog-secondary-copy">No resources are currently linked in this category.</p>
                )}
              </div>
            ))}
          </>
        )}
      </section>
      <section className="detail-section educational-resources-section">
        <h3>Miami Dade College Programs to Explore</h3>
        <p className="catalog-secondary-copy">
          Programs matched to this occupation using SOC codes.
          These are discovery candidates, not verified requirements
          or guaranteed admission pathways.
        </p>

        {mdcLoading && <p role="status">LOADING MDC PROGRAMS…</p>}

        {mdcError && (
          <div className="catalog-detail-load-note" role="status">
            MDC programs could not be loaded: {mdcError}
            <button type="button" onClick={onRetryMdc}>
              RETRY MDC PROGRAMS
            </button>
          </div>
        )}

        {!mdcLoading && !mdcError && (
          <div className="catalog-resource-group">
            <h4>Programs matching this occupation</h4>
            {mdcResources?.resources?.length ? (
              <ul>
                {mdcResources.resources.map((resource) => (
                  <li key={resource.id}>
                    <strong>{resource.title}</strong>
                    <span>{resource.organization} · {resource.type}</span>
                    <small className="resource-verification is-unverified">
                      UNVERIFIED
                    </small>
                    {resource.source_url && (
                      <a href={resource.source_url} target="_blank" rel="noreferrer">
                        Open resource
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="catalog-secondary-copy">
                No matching MDC programs are currently available.
              </p>
            )}
          </div>
        )}
      </section>
      <section className="detail-section">
        <h3>Catalog sources</h3>
        {sources.length ? <ul>{sources.map(({ reference, url }) => (
          <li key={reference}>
            <strong>{reference.replaceAll('_', ' ')}</strong>
            {url ? <a href={url} target="_blank" rel="noreferrer">Open source</a> : <small>Source URL not supplied.</small>}
          </li>
        ))}</ul> : <p>No source references were supplied.</p>}
      </section>
      {error && (
        <div className="catalog-detail-load-note" role="status">
          Additional occupation-link metadata could not be loaded: {error}
          <button type="button" onClick={onRetry}>RETRY</button>
        </div>
      )}
      {detail?.linked_career_ids?.length > 0 && (
        <section className="detail-section">
          <h3>Linked legacy career IDs</h3>
          <p>{detail.linked_career_ids.join(', ')}</p>
        </section>
      )}
      {loading && <p className="catalog-secondary-copy" role="status">Refreshing occupation record…</p>}
      <QuestionPlaceholder onOpenChat={onOpenChat} />
    </>
  )
}

export default function BubbleExplorer({
  responses,
  providedMatches = null,
  matchSource = 'backend',
  onEnterRpg,
  onCareerExploration,
  exploredCareerIds = [],
  activeTargetCareer,
  onSetActiveTargetCareer,
  onExportSave,
  careerChatPersonalizationConsent,
  onCareerChatPersonalizationConsentChange,
  onCareerChatPersonalizationDataChange,
}) {
  const [matches, setMatches] = useState(providedMatches || [])
  const [matchStatus, setMatchStatus] = useState(providedMatches ? 'ready' : 'loading')
  const [matchError, setMatchError] = useState('')
  const [retryMatches, setRetryMatches] = useState(0)
  const [careerDetails, setCareerDetails] = useState({})
  const [detailErrors, setDetailErrors] = useState({})
  const [retryDetails, setRetryDetails] = useState(0)
  const [enabledTags, setEnabledTags] = useState(new Set())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [guideExpanded, setGuideExpanded] = useState(true)
  const [careerChatHasOpened, setCareerChatHasOpened] = useState(false)
  const [careerChatExpanded, setCareerChatExpanded] = useState(false)
  const [careerChatDraft, setCareerChatDraft] = useState('')
  const [careerChatCareer, setCareerChatCareer] = useState(null)
  const [careerChatEntries, setCareerChatEntries] = useState([])
  const [careerChatLoading, setCareerChatLoading] = useState(false)
  const [careerChatError, setCareerChatError] = useState('')
  const [includePreviousChatMessages, setIncludePreviousChatMessages] = useState(false)
  const [careerChatConsentStartIndex, setCareerChatConsentStartIndex] = useState(0)
  const [explorerMode, setExplorerMode] = useState(matchSource === 'skipped' ? 'catalog' : 'matches')
  const [catalogStatus, setCatalogStatus] = useState('idle')
  const [catalogError, setCatalogError] = useState('')
  const [catalogSource, setCatalogSource] = useState('live')
  const [catalogRetry, setCatalogRetry] = useState(0)
  const [jobFamilies, setJobFamilies] = useState([])
  const [allOccupations, setAllOccupations] = useState([])
  const [familyOccupations, setFamilyOccupations] = useState([])
  const [catalogMetadata, setCatalogMetadata] = useState(null)
  const [occupationMappings, setOccupationMappings] = useState(null)
  const [selectedFieldId, setSelectedFieldId] = useState('')
  const [selectedFamilyId, setSelectedFamilyId] = useState('')
  const [familyLoading, setFamilyLoading] = useState(false)
  const [familyError, setFamilyError] = useState('')
  const [selectedOccupationId, setSelectedOccupationId] = useState('')
  const [occupationDetails, setOccupationDetails] = useState({})
  const [occupationDetailErrors, setOccupationDetailErrors] = useState({})
  const [occupationDetailLoading, setOccupationDetailLoading] = useState(false)
  const clickTimer = useRef(null)
  const careerChatController = useRef(null)
  const familyController = useRef(null)
  const occupationDetailController = useRef(null)
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1280 : window.innerWidth
  ))
  const [occupationMdcResources, setOccupationMdcResources] = useState({})
  const [occupationMdcErrors, setOccupationMdcErrors] = useState({})
  const [occupationMdcLoading, setOccupationMdcLoading] = useState(false)
  const [occupationRoadmaps, setOccupationRoadmaps] = useState({})
  const [occupationRoadmapErrors, setOccupationRoadmapErrors] = useState({})
  const [occupationRoadmapLoading, setOccupationRoadmapLoading] = useState(false)

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', updateViewportWidth)
    return () => window.removeEventListener('resize', updateViewportWidth)
  }, [])

  const responsesJson = JSON.stringify(responses)
  const providedMatchesJson = JSON.stringify(providedMatches)
  useEffect(() => {
    if (providedMatches !== null) {
      setMatches(JSON.parse(providedMatchesJson))
      setMatchStatus('ready')
      setMatchError('')
      return undefined
    }
    const controller = new AbortController()
    setMatchStatus('loading')
    setMatchError('')
    getCareerMatches(JSON.parse(responsesJson), { signal: controller.signal })
      .then((nextMatches) => {
        if (controller.signal.aborted) return
        setMatches(nextMatches)
        setMatchStatus('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setMatchError(error.message)
        setMatchStatus('error')
      })
    return () => controller.abort()
  }, [responsesJson, providedMatches, providedMatchesJson, retryMatches])

  useEffect(() => {
    if (matchStatus !== 'ready') return undefined
    const tags = [...new Set(matches.flatMap(matchTags))]
    setEnabledTags(new Set(tags))
    setCareerDetails({})
    setDetailErrors({})
    if (!matches.length) return undefined

    const controller = new AbortController()
    Promise.all(matches.map(async (match) => {
      try {
        const detail = await getCareer(match.career_id, { signal: controller.signal })
        return [match.career_id, detail, null]
      } catch (error) {
        return [match.career_id, null, error.message]
      }
    })).then((results) => {
      if (controller.signal.aborted) return
      const nextDetails = {}
      const nextErrors = {}
      for (const [id, detail, error] of results) {
        if (detail) nextDetails[id] = detail
        if (error) nextErrors[id] = error
      }
      setCareerDetails(nextDetails)
      setDetailErrors(nextErrors)
    })
    return () => controller.abort()
  }, [matches, matchStatus, retryDetails])

  useEffect(() => {
    if (explorerMode !== 'catalog') return undefined
    const controller = new AbortController()
    setCatalogStatus('loading')
    setCatalogError('')
    setCatalogSource('live')
    setOccupationMappings(KNOWN_OCCUPATION_MAPPINGS)

    // The mapping route is optional enrichment. It must never prevent the
    // actual 20-family / 115-occupation catalog bubbles from rendering.
    getOccupationMappings({ signal: controller.signal })
      .then((mappingResult) => {
        if (!controller.signal.aborted) setOccupationMappings(mappingResult)
      })
      .catch(() => {
        if (!controller.signal.aborted) setOccupationMappings(KNOWN_OCCUPATION_MAPPINGS)
      })

    // Only the two endpoints that provide the catalog itself are required.
    Promise.all([
      getJobFamilies({ signal: controller.signal }),
      getOccupations({ signal: controller.signal }),
    ]).then(([familyResult, occupationResult]) => {
      if (controller.signal.aborted) return
      setJobFamilies(familyResult.families)
      setAllOccupations(occupationResult.occupations)
      setCatalogMetadata(occupationResult.metadata)
      setCatalogSource('live')
      setCatalogStatus('ready')
    }).catch((error) => {
      if (controller.signal.aborted) return
      // The bundled file is an exact snapshot of the backend's supplied
      // orquest_job_catalog.json. It keeps exploration available during local
      // API/proxy/CORS problems and is clearly labelled as a snapshot.
      setJobFamilies(jobCatalogSnapshot.families)
      setAllOccupations(jobCatalogSnapshot.occupations)
      setCatalogMetadata(BUNDLED_CATALOG_METADATA)
      setOccupationMappings(KNOWN_OCCUPATION_MAPPINGS)
      setCatalogSource('bundled')
      setCatalogError(error.message)
      setCatalogStatus('ready')
    })
    return () => controller.abort()
  }, [explorerMode, catalogRetry])

  useEffect(() => () => {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    careerChatController.current?.abort()
    familyController.current?.abort()
    occupationDetailController.current?.abort()
  }, [])

  const tags = useMemo(() => [...new Set(matches.flatMap(matchTags))], [matches])
  const tagColors = useMemo(() => new Map(tags.map((tag, index) => [tag, TAG_COLORS[index % TAG_COLORS.length]])), [tags])
  const normalizedQuery = query.trim().toLowerCase()
  const visibleMatches = useMemo(() => matches.filter((match) =>
    matchesSearch(match, careerDetails[match.career_id], normalizedQuery)
  ), [matches, careerDetails, normalizedQuery])
  const positions = useMemo(() => layoutMatches(matches), [matches])
  const selectedMatch = matches.find((match) => match.career_id === selectedId)
  const selectedDetail = selectedId ? careerDetails[selectedId] : null
  const selectedColor = colorForTag(primaryTag(selectedMatch || {}), tagColors)
  const careerFieldGroups = useMemo(() => buildCareerFieldGroups(jobFamilies), [jobFamilies])
  const selectedField = careerFieldGroups.find((field) => field.id === selectedFieldId) || null
  const selectedFamily = jobFamilies.find((family) => family.id === selectedFamilyId) || null
  const selectedFieldFamilies = selectedField?.families || []
  const selectedOccupation = allOccupations.find((occupation) => occupation.id === selectedOccupationId) || null
  const mappedOccupationId = selectedMatch ? occupationMappings?.career_to_occupation?.[selectedMatch.career_id] : null
  const mappedOccupation = mappedOccupationId ? allOccupations.find((occupation) => occupation.id === mappedOccupationId) : null
  const occupationDetailRecord = occupationDetails[selectedOccupationId]?.occupation || selectedOccupation
  const occupationSearchResults = normalizedQuery
    ? allOccupations.filter((occupation) => `${occupation.title} ${occupation.bls_title} ${occupation.soc_code} ${occupation.summary}`.toLowerCase().includes(normalizedQuery))
    : []
  const familySearchResults = normalizedQuery
    ? jobFamilies.filter((family) => `${family.name} ${family.bls_group_title} ${family.bls_group_code}`.toLowerCase().includes(normalizedQuery))
    : []
  const fieldSearchResults = normalizedQuery
    ? careerFieldGroups.filter((field) => `${field.label} ${field.description}`.toLowerCase().includes(normalizedQuery))
    : []
  const catalogNodeType = normalizedQuery
    ? occupationSearchResults.length ? 'occupation' : fieldSearchResults.length ? 'field' : 'family'
    : selectedFamilyId ? 'occupation' : selectedFieldId ? 'family' : 'field'
  const catalogNodes = normalizedQuery
    ? occupationSearchResults.length ? occupationSearchResults : fieldSearchResults.length ? fieldSearchResults : familySearchResults
    : selectedFamilyId
      ? familyOccupations
      : selectedFieldId
        ? selectedFieldFamilies
        : careerFieldGroups
  const catalogPositions = useMemo(
    () => layoutCatalogBubbles(catalogNodes, catalogNodeType, viewportWidth),
    [catalogNodes, catalogNodeType, viewportWidth],
  )
  const catalogFocus = !normalizedQuery ? (selectedFamily || selectedField) : null
  const catalogFocusColor = selectedFamily
    ? careerFieldForFamily(selectedFamily.id, careerFieldGroups).color
    : selectedField?.color
  const enabledCount = tags.filter((tag) => enabledTags.has(tag)).length

  function toggleTag(tag) {
    setEnabledTags((current) => {
      const next = new Set(current)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  function switchExplorerMode(mode) {
    familyController.current?.abort()
    occupationDetailController.current?.abort()
    setFamilyLoading(false)
    if (mdcResult.status === 'fulfilled') {
      setOccupationMdcResources((current) => ({
        ...current,
        [occupationId]: mdcResult.value,
      }))
    } else {
      setOccupationMdcErrors((current) => ({
        ...current,
        [occupationId]: mdcResult.reason?.message || 'MDC programs unavailable.',
      }))
    }

    setOccupationDetailLoading(false)
    setOccupationRoadmapLoading(false)
    setOccupationMdcLoading(false)
    setExplorerMode(mode)
    setDetailOpen(false)
    setSelectedId('')
    setSelectedOccupationId('')
    setSelectedFieldId('')
    setSelectedFamilyId('')
    setFamilyOccupations([])
    setFamilyError('')
    setQuery('')
  }

  function selectCareerField(field) {
    familyController.current?.abort()
    occupationDetailController.current?.abort()
    setFamilyLoading(false)
    setOccupationDetailLoading(false)
    setOccupationRoadmapLoading(false)
    setSelectedFieldId(field.id)
    setSelectedFamilyId('')
    setSelectedOccupationId('')
    setSelectedId('')
    setFamilyOccupations([])
    setFamilyError('')
    setDetailOpen(false)
    setQuery('')
  }

  function selectJobFamily(family) {
    setQuery('')
    familyController.current?.abort()
    setFamilyLoading(false)
    setSelectedFieldId(careerFieldGroups.find((field) => field.families.some((item) => item.id === family.id))?.id || '')
    setSelectedFamilyId(family.id)
    setSelectedOccupationId('')
    setSelectedId('')
    setDetailOpen(false)
    setFamilyError('')
    // All occupations were already loaded with the catalog. Filter locally
    // instead of making another request for the same data on every family click.
    setFamilyOccupations(allOccupations.filter((occupation) => occupation.family_id === family.id))
  }

  function returnToJobFamilies() {
    familyController.current?.abort()
    setFamilyLoading(false)
    setSelectedFamilyId('')
    setFamilyOccupations([])
    setFamilyError('')
    setSelectedOccupationId('')
    setSelectedId('')
    setDetailOpen(false)
  }

  function returnToCareerFields() {
    familyController.current?.abort()
    setFamilyLoading(false)
    setSelectedFieldId('')
    setSelectedFamilyId('')
    setFamilyOccupations([])
    setFamilyError('')
    setSelectedOccupationId('')
    setSelectedId('')
    setDetailOpen(false)
    setQuery('')
  }

  function occupationAsCareerTarget(occupation) {
    return {
      career_id: occupation.id,
      title: occupation.title,
      family_id: occupation.family_id,
      matched_interest_tags: [],
    }
  }

  function selectOccupation(occupation) {
    setSelectedOccupationId(occupation.id)
    setSelectedId(occupation.id)
    setDetailOpen(false)
    onCareerExploration?.(occupationAsCareerTarget(occupation))
  }

  async function loadOccupationDetail(occupation) {
    const occupationId = occupation.id
    const needsDetail = !occupationDetails[occupationId]
    const needsResources = !occupationRoadmaps[occupationId]
    const needsMdc = !occupationMdcResources[occupationId]
    if (!needsDetail && !needsResources && !needsMdc) return

    occupationDetailController.current?.abort()
    const controller = new AbortController()
    occupationDetailController.current = controller
    setOccupationDetailLoading(needsDetail)
    setOccupationRoadmapLoading(needsResources)
    setOccupationMdcLoading(needsMdc)
    setOccupationMdcErrors((current) => ({ ...current, [occupationId]: '' }))
    setOccupationDetailErrors((current) => ({ ...current, [occupationId]: '' }))
    setOccupationRoadmapErrors((current) => ({ ...current, [occupationId]: '' }))

    const [detailResult, roadmapResult, mdcResult] = await Promise.allSettled([
      needsDetail
        ? getOccupationDetail(occupationId, { signal: controller.signal })
        : Promise.resolve(occupationDetails[occupationId]),
      needsResources
        // The current backend exposes education resources through the existing
        // occupation roadmap contract; it does not expose a /resources route.
        // No student profile or questionnaire data is sent here.
        ? getOccupationRoadmap(occupationId, { signal: controller.signal, profile: {} })
        : Promise.resolve(occupationRoadmaps[occupationId]),
      needsMdc
        ? getOccupationResources(occupationId, { signal: controller.signal })
        : Promise.resolve(occupationMdcResources[occupationId]),
    ])

    if (controller.signal.aborted) return

    if (detailResult.status === 'fulfilled') {
      setOccupationDetails((current) => ({ ...current, [occupationId]: detailResult.value }))
      setCatalogMetadata(detailResult.value.metadata)
    } else {
      setOccupationDetailErrors((current) => ({ ...current, [occupationId]: detailResult.reason?.message || 'Occupation details unavailable.' }))
    }

    if (roadmapResult.status === 'fulfilled') {
      setOccupationRoadmaps((current) => ({ ...current, [occupationId]: roadmapResult.value }))
    } else {
      setOccupationRoadmapErrors((current) => ({ ...current, [occupationId]: roadmapResult.reason?.message || 'Educational resources unavailable.' }))
    }

    setOccupationDetailLoading(false)
    setOccupationRoadmapLoading(false)
  }

  function openOccupationDetails(occupation) {
    setSelectedOccupationId(occupation.id)
    setSelectedId(occupation.id)
    setDetailOpen(true)
    onCareerExploration?.(occupationAsCareerTarget(occupation))
    loadOccupationDetail(occupation)
  }

  function handleOccupationClick(occupation) {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(() => selectOccupation(occupation), 240)
  }

  function handleOccupationDoubleClick(occupation) {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    openOccupationDetails(occupation)
  }

  function chooseOccupationAsGoal(occupation) {
    onSetActiveTargetCareer?.(occupationAsCareerTarget(occupation))
  }

  function openMappedOccupation(occupation) {
    if (!occupation) return
    setExplorerMode('catalog')
    setSelectedFieldId(careerFieldGroups.find((field) => field.families.some((item) => item.id === occupation.family_id))?.id || '')
    setSelectedFamilyId(occupation.family_id)
    setFamilyOccupations(allOccupations.filter((item) => item.family_id === occupation.family_id))
    setSelectedOccupationId(occupation.id)
    setSelectedId(occupation.id)
    setDetailOpen(true)
    loadOccupationDetail(occupation)
  }

  function emitCareerChatPersonalization(consented, entries = []) {
    if (!onCareerChatPersonalizationDataChange || !careerChatCareer) return
    const messages = entries.flatMap((entry) => [
      { role: 'user', content: entry.question },
      ...(entry.answer ? [{ role: 'assistant', content: entry.answer, status: entry.metadata?.status || 'unavailable' }] : []),
    ])
    onCareerChatPersonalizationDataChange({
      source: 'career_chat',
      consented,
      careerId: careerChatCareer.career_id,
      careerTitle: careerChatCareer.title,
      messages: consented ? messages : [],
    })
  }

  function changeCareerChatConsent(value) {
    onCareerChatPersonalizationConsentChange?.(value)
    if (value) {
      const currentCareerEntries = careerChatEntries.filter((entry) => entry.career_id === careerChatCareer?.career_id)
      setCareerChatConsentStartIndex(currentCareerEntries.length)
      setIncludePreviousChatMessages(false)
      emitCareerChatPersonalization(true, [])
    } else {
      setIncludePreviousChatMessages(false)
      emitCareerChatPersonalization(false, [])
    }
  }

  function changeIncludePreviousChatMessages(value) {
    setIncludePreviousChatMessages(value)
    if (!careerChatPersonalizationConsent) return
    const currentCareerEntries = careerChatEntries.filter((entry) => entry.career_id === careerChatCareer?.career_id)
    const eligibleEntries = value
      ? currentCareerEntries
      : currentCareerEntries.slice(careerChatConsentStartIndex)
    emitCareerChatPersonalization(true, eligibleEntries)
  }

  function selectCareer(match) {
    setSelectedId(match.career_id)
    setDetailOpen(false)
    onCareerExploration?.(match)
  }

  function handleCareerClick(match) {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(() => selectCareer(match), 240)
  }

  function handleCareerDoubleClick(match) {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    setSelectedId(match.career_id)
    setDetailOpen(true)
    onCareerExploration?.(match)
  }

  function retryCareerDetails() {
    setRetryDetails((value) => value + 1)
  }

  function openCareerChat(question, career) {
    if (careerChatCareer?.career_id !== career?.career_id) {
      const existingCareerMessages = careerChatEntries.filter((entry) => entry.career_id === career?.career_id)
      setCareerChatConsentStartIndex(existingCareerMessages.length)
      setIncludePreviousChatMessages(false)
    }
    setCareerChatDraft(question)
    setCareerChatCareer(career)
    setCareerChatHasOpened(true)
    setCareerChatExpanded(true)
  }

  async function sendCareerQuestion(question) {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || !careerChatCareer?.career_id || careerChatLoading) return

    careerChatController.current?.abort()
    const controller = new AbortController()
    careerChatController.current = controller
    setCareerChatError('')
    setCareerChatLoading(true)
    try {
      // Each request contains only the explicitly submitted question and the career being discussed.
      // The API accepts neither quiz answers nor conversation history.
      const response = await submitCareerQuestion({
        career_id: careerChatCareer.career_id,
        question: trimmedQuestion,
      }, { signal: controller.signal })
      if (controller.signal.aborted) return
      const blocked = response.metadata.status === 'blocked'
      const nextEntry = {
        career_id: careerChatCareer.career_id,
        question: trimmedQuestion,
        answer: blocked ? '' : response.answer,
        source_urls: blocked ? [] : response.source_urls,
        resource_ids: blocked ? [] : response.resource_ids,
        metadata: response.metadata,
      }
      setCareerChatEntries((current) => {
        const nextEntries = [...current, nextEntry]
        if (careerChatPersonalizationConsent) {
          const careerEntries = nextEntries.filter((entry) => entry.career_id === careerChatCareer.career_id)
          const eligibleEntries = includePreviousChatMessages
            ? careerEntries
            : careerEntries.slice(careerChatConsentStartIndex)
          emitCareerChatPersonalization(true, eligibleEntries)
        }
        return nextEntries
      })
      setCareerChatDraft('')
    } catch (error) {
      if (error.name !== 'AbortError' && !controller.signal.aborted) setCareerChatError(error.message)
    } finally {
      if (!controller.signal.aborted) setCareerChatLoading(false)
    }
  }

  function toggleCareerChat() {
    setCareerChatHasOpened(true)
    setCareerChatExpanded((expanded) => !expanded)
  }

  const edges = []
  for (let left = 0; left < matches.length; left += 1) {
    for (let right = left + 1; right < matches.length; right += 1) {
      const leftMatch = matches[left]
      const rightMatch = matches[right]
      const sharedTag = matchTags(leftMatch).find((tag) => matchTags(rightMatch).includes(tag))
      if (!sharedTag) continue
      const from = positions.get(leftMatch.career_id)
      const to = positions.get(rightMatch.career_id)
      const visible = enabledTags.has(primaryTag(leftMatch)) && enabledTags.has(primaryTag(rightMatch))
      edges.push(
        <line
          key={`${leftMatch.career_id}-${rightMatch.career_id}`}
          className={`map-edge scope-edge ${visible ? '' : 'link-muted'}`}
          x1={from.x * 10}
          y1={from.y * 6.5}
          x2={to.x * 10}
          y2={to.y * 6.5}
          style={{ '--bubble-color': colorForTag(sharedTag, tagColors) }}
        />,
      )
    }
  }

  return (
    <section className="bubble-screen">
      <header className="map-header" inert={careerChatExpanded} aria-hidden={careerChatExpanded}>
        <div className="map-brand">
          <OrquestLogo compact />
          <div className="map-header-title">
            <span>ORQUEST / FIELD MAP</span>
            <div className="map-title-row">
              <h1>Bubble Explorer</h1>
              <div className="bubble-mode-switch" role="group" aria-label="Bubble Explorer view">
                <button type="button" className={explorerMode === 'matches' ? 'is-active' : ''} aria-pressed={explorerMode === 'matches'} onClick={() => switchExplorerMode('matches')}>MATCHES</button>
                <button type="button" className={explorerMode === 'catalog' ? 'is-active' : ''} aria-pressed={explorerMode === 'catalog'} onClick={() => switchExplorerMode('catalog')}>CAREER CATALOG</button>
              </div>
              <button className="rpg-entry-button" type="button" onClick={onEnterRpg}>Enter RPG</button>
            </div>
          </div>
        </div>
        <label className="map-search" htmlFor="career-map-search">
          <SearchIcon />
          <input
            id="career-map-search"
            type="search"
            aria-label="Search careers, fields, or pathways..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={explorerMode === 'catalog' ? 'Search career fields, job families, or occupations...' : 'Search careers, fields, or pathways...'}
          />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
        </label>
        <div className="map-header-status"><i /> {explorerMode === 'catalog'
          ? (catalogStatus === 'loading' ? 'LOADING CATALOG' : catalogStatus === 'error' ? 'CATALOG UNAVAILABLE' : `${allOccupations.length} OCCUPATIONS / ${jobFamilies.length} FAMILIES${catalogSource === 'bundled' ? ' · SNAPSHOT' : ''}`)
          : (matchStatus === 'loading' ? 'LOADING MATCHES' : matchStatus === 'error' ? 'API UNAVAILABLE' : matchSource === 'skipped' ? 'DISCOVERY SKIPPED · EXPLORE CATALOG' : `${matches.length} ${matchSource === 'bundled' ? 'BUNDLED' : 'BACKEND'} MATCHES`)}</div>
        <div className="map-header-actions">
          <button className="save-export-button save-export-compact" type="button" aria-label="Export saved progress" onClick={onExportSave}>SAVE</button>
          <span className="session-active-label">SESSION ACTIVE</span>
        </div>
      </header>

      <main className="map-frame" inert={detailOpen || careerChatExpanded} aria-hidden={detailOpen || careerChatExpanded}>
        <div className={`map-filterbar ${explorerMode === 'catalog' ? 'catalog-filterbar' : ''}`}>
          {explorerMode === 'matches' ? (
            <>
              <div className="filter-title"><span>MATCHED INTEREST TAGS</span><small>CLICK TO MUTE / LIGHT</small></div>
              <div className="map-filter-list" aria-label="Career interest tag filters">
                {tags.map((tag) => {
                  const enabled = enabledTags.has(tag)
                  return (
                    <button
                      key={tag}
                      className={`map-filter ${enabled ? '' : 'is-muted'}`}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      aria-label={`Toggle ${formatTag(tag)}`}
                      aria-pressed={enabled}
                      style={{ '--bubble-color': colorForTag(tag, tagColors) }}
                    >
                      <i />{formatTag(tag)}
                    </button>
                  )
                })}
                {matchStatus === 'ready' && tags.length === 0 && <span className="filter-empty">No matched interest tags returned</span>}
              </div>
              <span className="filter-count">{enabledCount.toString().padStart(2, '0')} / {tags.length.toString().padStart(2, '0')}</span>
              <button
                className="browse-job-catalog-cta"
                type="button"
                onClick={() => switchExplorerMode('catalog')}
                aria-label={`Browse the full job catalog of ${allOccupations.length || 115} occupations`}
              >
                <span>BROWSE JOB CATALOG</span>
                <small>{allOccupations.length || 115} OCCUPATIONS</small>
                <b aria-hidden="true">→</b>
              </button>
            </>
          ) : (
            <>
              <div className="filter-title">
                <span>{selectedFamily
                  ? selectedFamily.name.toUpperCase()
                  : selectedField
                    ? selectedField.label.toUpperCase()
                    : normalizedQuery
                      ? (occupationSearchResults.length ? 'OCCUPATION SEARCH' : fieldSearchResults.length ? 'CAREER FIELD SEARCH' : 'JOB FAMILY SEARCH')
                      : 'CAREER FIELDS'}</span>
                <small>{selectedFamily
                  ? `${familyOccupations.length} OCCUPATIONS`
                  : selectedField
                    ? `${selectedFieldFamilies.length} JOB FAMILIES · ${selectedField.occupationCount} OCCUPATIONS`
                    : normalizedQuery
                      ? 'SEARCH RESULTS ACROSS THE CATALOG'
                      : 'BROWSE A BROAD FIELD TO EXPLORE'}</small>
              </div>
              {selectedFamily && selectedField && <button className="catalog-back-button" type="button" onClick={returnToJobFamilies}>← {selectedField.label}</button>}
              {selectedFamily && !selectedField && <button className="catalog-back-button" type="button" onClick={returnToCareerFields}>← ALL FIELDS</button>}
              {!selectedFamily && selectedField && !normalizedQuery && <button className="catalog-back-button" type="button" onClick={returnToCareerFields}>← ALL FIELDS</button>}
              <div className="catalog-filter-note">
                <strong>ORQUEST EXPLORATION FIELDS</strong>
                <span>Broad color-coded browsing groups over the backend job families; these are navigation categories, not official BLS classifications.</span>
              </div>
            </>
          )}
        </div>

        <div className={`map-canvas ${explorerMode === 'catalog' ? 'catalog-map-canvas' : ''} ${(explorerMode === 'matches' ? matches.length : catalogNodes.length) > 20 ? 'map-dense' : ''}`}>
          <svg className="map-links" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
            {explorerMode === 'matches' ? edges : null}
            {explorerMode === 'catalog' && catalogFocus && !normalizedQuery && catalogNodes.map((item) => {
              const position = catalogPositions.get(item.id)
              if (!position) return null
              return <line
                key={`catalog-link-${item.id}`}
                className="map-edge catalog-edge"
                x1="500"
                y1="325"
                x2={position.x * 10}
                y2={position.y * 6.5}
                style={{ '--bubble-color': catalogFocusColor }}
              />
            })}
          </svg>
          {explorerMode === 'matches' && matches.map((match) => {
            const position = positions.get(match.career_id)
            const tag = primaryTag(match)
            const tagVisible = !tag || enabledTags.has(tag)
            const isMatch = matchesSearch(match, careerDetails[match.career_id], normalizedQuery)
            const isSelected = selectedId === match.career_id
            const wasExplored = exploredCareerIds.includes(match.career_id)
            const isActiveTarget = activeTargetCareer?.career_id === match.career_id
            const color = colorForTag(tag, tagColors)
            return (
              <button
                key={match.career_id}
                className={`career-node ${tagVisible ? '' : 'is-muted'} ${normalizedQuery && isMatch ? 'is-search-match' : ''} ${normalizedQuery && !isMatch ? 'is-search-dim' : ''} ${isSelected ? 'is-selected' : ''}`}
                type="button"
                style={{ left: `${position.x}%`, top: `${position.y}%`, '--bubble-color': color, '--bubble-size': `${position.size}px` }}
                onClick={() => handleCareerClick(match)}
                onDoubleClick={() => handleCareerDoubleClick(match)}
                aria-label={match.title}
                aria-pressed={isSelected}
                title={`${wasExplored ? 'Explored. ' : ''}${isActiveTarget ? 'Active RPG target. ' : ''}Click for summary · double-click for details`}
              >
                <span className="career-orb" aria-hidden="true"><i /></span>
                <span className="career-node-label">{match.title}</span>
              </button>
            )
          })}

          {explorerMode === 'catalog' && catalogStatus === 'ready' && catalogFocus && !normalizedQuery && (
            <div className="catalog-focus-node" style={{ '--bubble-color': catalogFocusColor }} aria-hidden="true">
              <span className="career-orb"><i /></span>
              <strong>{selectedFamily?.name || selectedField?.label}</strong>
              <small>{selectedFamily ? 'JOB FAMILY' : 'CAREER FIELD'}</small>
            </div>
          )}

          {explorerMode === 'catalog' && catalogStatus === 'ready' && catalogNodes.map((item) => {
            const isField = catalogNodeType === 'field'
            const isFamily = catalogNodeType === 'family'
            const position = catalogPositions.get(item.id)
            if (!position) return null
            const family = isFamily ? item : jobFamilies.find((entry) => entry.id === item.family_id)
            const field = isField ? item : careerFieldForFamily(family?.id || item.family_id, careerFieldGroups)
            const color = field?.color || '#a9adb0'
            const isSelected = isField ? selectedFieldId === item.id : isFamily ? selectedFamilyId === item.id : selectedOccupationId === item.id
            return (
              <button
                key={item.id}
                className={`career-node catalog-node ${isSelected ? 'is-selected' : ''} ${isField ? 'catalog-field-node' : isFamily ? 'catalog-family-node' : 'catalog-occupation-node'}`}
                type="button"
                style={{ left: `${position.x}%`, top: `${position.y}%`, '--bubble-color': color, '--bubble-size': `${position.size}px` }}
                onClick={() => isField ? selectCareerField(item) : isFamily ? selectJobFamily(item) : handleOccupationClick(item)}
                onDoubleClick={() => { if (!isField && !isFamily) handleOccupationDoubleClick(item) }}
                aria-label={isField ? `Explore ${item.label} career field` : isFamily ? `Browse ${item.name} job family` : `Open ${item.title} occupation`}
                aria-pressed={isSelected}
                title={isField
                  ? `${item.label} · ${item.familyCount} job families · ${item.occupationCount} occupations`
                  : isFamily
                    ? `Browse ${item.name} occupations · ${field?.label || 'Career field'}`
                    : `${item.title} · ${family?.name || 'Job family'} · click for summary, double-click for details`}
              >
                <span className="career-orb" aria-hidden="true"><i /></span>
                <span className="career-node-label">{isField ? item.label : isFamily ? item.name : item.title}</span>
                {isField && <small className="catalog-node-count">{item.familyCount} FAMILIES · {item.occupationCount} JOBS</small>}
                {isFamily && <small className="catalog-node-count">{item.occupation_ids.length} OCCUPATIONS</small>}
                {!isField && !isFamily && <small className="catalog-node-meta">{item.verified_per_row ? 'VERIFIED' : 'UNVERIFIED'}</small>}
              </button>
            )
          })}

          {explorerMode === 'catalog' && catalogStatus === 'loading' && <div className="map-empty-state" role="status">LOADING JOB FAMILIES AND OCCUPATIONS…</div>}
          {explorerMode === 'catalog' && catalogStatus === 'error' && (
            <div className="map-empty-state map-error-state" role="alert">
              <strong>CAREER CATALOG IS UNAVAILABLE</strong>
              <p>{catalogError}</p>
              <button className="pixel-button" type="button" onClick={() => setCatalogRetry((value) => value + 1)}>RETRY CATALOG</button>
            </div>
          )}
          {explorerMode === 'catalog' && catalogStatus === 'ready' && familyLoading && <div className="catalog-loading-chip" role="status">LOADING FAMILY OCCUPATIONS…</div>}
          {explorerMode === 'catalog' && familyError && <div className="catalog-family-error" role="alert">{familyError} <button type="button" onClick={() => selectedFamily && selectJobFamily(selectedFamily)}>RETRY</button></div>}
          {explorerMode === 'catalog' && catalogStatus === 'ready' && !familyLoading && catalogNodes.length === 0 && (
            <div className="map-empty-state" role="status">
              <strong>{selectedFamily ? 'NO OCCUPATIONS FOUND' : selectedField ? 'NO JOB FAMILIES FOUND' : 'NO CATALOG RESULTS'}</strong>
              <p>{selectedFamily ? 'No occupations match this family and search.' : selectedField ? 'No job families are assigned to this exploration field.' : 'Try another occupation, job-family, or career-field search.'}</p>
            </div>
          )}

          {explorerMode === 'matches' && matchStatus === 'loading' && <div className="map-empty-state" role="status">CALCULATING CAREER MATCHES…</div>}
          {explorerMode === 'matches' && matchStatus === 'error' && (
            <div className="map-empty-state map-error-state" role="alert">
              <strong>CAREER MATCHES ARE UNAVAILABLE</strong>
              <p>{matchError}</p>
              <button className="pixel-button" type="button" onClick={() => setRetryMatches((value) => value + 1)}>RETRY MATCHES</button>
            </div>
          )}
          {explorerMode === 'matches' && matchStatus === 'ready' && matches.length === 0 && (
            <div className="map-empty-state" role="status">
              <strong>{matchSource === 'skipped' ? 'CAREER DISCOVERY SKIPPED' : 'NO CAREER MATCHES RETURNED'}</strong>
              <p>{matchSource === 'skipped'
                ? 'No questionnaire answers or match scores were created. Open the Career Catalog to explore all available occupations.'
                : matchSource === 'bundled'
                ? 'The bundled career data found no positive interest alignment for these answers.'
                : 'The backend found no positive interest alignment for these responses.'}</p>
              {matchSource === 'skipped' && <button className="pixel-button" type="button" onClick={() => switchExplorerMode('catalog')}>EXPLORE CAREER CATALOG</button>}
            </div>
          )}
          {explorerMode === 'matches' && matchStatus === 'ready' && matches.length > 0 && visibleMatches.length === 0 && (
            <div className="map-no-match" role="status">NO MATCHING CAREER / TRY ANOTHER SEARCH</div>
          )}

          {explorerMode === 'matches' && selectedMatch && !detailOpen && (
            <aside className="map-summary" style={{ '--bubble-color': selectedColor }} onDoubleClick={(event) => {
              if (event.target.closest('button, input, a')) return
              setDetailOpen(true)
            }} title="Double-click this summary to open full career details">
              <div className="summary-header">
                <div><span className="summary-kicker">CAREER SUMMARY / DOUBLE-CLICK TO EXPAND</span><h2>{selectedMatch.title}</h2></div>
                <button type="button" aria-label="Close career summary" onClick={() => setSelectedId('')}>×</button>
              </div>
              {careerDetails[selectedId] ? (
                <p className="summary-copy">{selectedDetail.summary || 'Career summary is unavailable in the backend record.'}</p>
              ) : detailErrors[selectedId] ? (
                <div className="summary-copy summary-unavailable" role="alert">
                  <p>Career details could not be loaded: {detailErrors[selectedId]}</p>
                  <button type="button" className="inline-retry" onClick={retryCareerDetails}>RETRY DETAILS</button>
                </div>
              ) : <p className="summary-copy" role="status">LOADING CAREER DETAILS…</p>}
              <div className="summary-tags">
                {matchTags(selectedMatch).map((tag) => <span key={tag}>{formatTag(tag)}</span>)}
              </div>
              {mappedOccupationId && (
                <div className="catalog-match-link">
                  <span>EXPLICIT CATALOG MAPPING / {mappedOccupation?.title || mappedOccupationId}</span>
                  {mappedOccupation && <button type="button" onClick={() => openMappedOccupation(mappedOccupation)}>VIEW OCCUPATION RECORD</button>}
                </div>
              )}
              <button
                className={`career-target-button ${activeTargetCareer?.career_id === selectedMatch.career_id ? 'is-active' : ''}`}
                type="button"
                disabled={activeTargetCareer?.career_id === selectedMatch.career_id}
                onClick={() => onSetActiveTargetCareer?.(selectedMatch)}
              >
                {activeTargetCareer?.career_id === selectedMatch.career_id ? 'ACTIVE RPG GOAL' : 'CHOOSE THIS AS MY GOAL'}
              </button>
              <QuestionPlaceholder onOpenChat={(question) => openCareerChat(question, selectedMatch)} />
            </aside>
          )}

          {explorerMode === 'catalog' && selectedOccupation && !detailOpen && (
            <aside className="map-summary catalog-summary" style={{ '--bubble-color': careerFieldForFamily(selectedOccupation.family_id, careerFieldGroups).color }}>
              <div className="summary-header">
                <div>
                  <span className="summary-kicker">OCCUPATION SUMMARY / DOUBLE-CLICK NODE FOR DETAILS</span>
                  <h2>{selectedOccupation.title}</h2>
                </div>
                <button type="button" aria-label="Close occupation summary" onClick={() => { setSelectedOccupationId(''); setSelectedId('') }}>×</button>
              </div>
              <p className="summary-copy">{selectedOccupation.summary}</p>
              <div className="catalog-summary-meta">
                <span>{jobFamilies.find((family) => family.id === selectedOccupation.family_id)?.name || 'Job family not supplied'}</span>
                <span>{selectedOccupation.verified_per_row ? 'ROW VERIFIED' : 'UNVERIFIED REFERENCE ROW'}</span>
                <span>US national median (2025) / {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(selectedOccupation.national_wage_2025.median_annual_usd)}</span>
              </div>
              <button className="catalog-detail-button" type="button" onClick={() => openOccupationDetails(selectedOccupation)}>OPEN OCCUPATION DETAILS</button>
              <button
                className={`career-target-button ${activeTargetCareer?.career_id === selectedOccupation.id ? 'is-active' : ''}`}
                type="button"
                disabled={activeTargetCareer?.career_id === selectedOccupation.id}
                onClick={() => chooseOccupationAsGoal(selectedOccupation)}
              >
                {activeTargetCareer?.career_id === selectedOccupation.id ? 'ACTIVE RPG GOAL' : 'CHOOSE THIS AS MY GOAL'}
              </button>
              <QuestionPlaceholder onOpenChat={(question) => openCareerChat(question, occupationAsCareerTarget(selectedOccupation))} />
            </aside>
          )}

          {guideExpanded ? (
            <aside className="map-guide">
              <div className="guide-title"><i>?</i> FIELD GUIDE <small>SELECTED</small>
                <button type="button" aria-label="Collapse Field Guide" onClick={() => setGuideExpanded(false)}>⌄</button>
              </div>
              <strong className="guide-selection">{explorerMode === 'catalog'
                ? (selectedOccupation?.title || selectedFamily?.name || selectedField?.label || (normalizedQuery ? 'Catalog search' : 'Career fields'))
                : (selectedMatch?.title || 'Career map')}</strong>
              <span className="guide-family">{explorerMode === 'catalog'
                ? (selectedOccupation
                  ? (jobFamilies.find((family) => family.id === selectedOccupation.family_id)?.name || 'Job family not supplied')
                  : selectedFamily
                    ? `${selectedFamily.occupation_ids.length} occupations in this family`
                    : selectedField
                      ? `${selectedField.familyCount} job families · ${selectedField.occupationCount} occupations`
                      : 'Browse a broad career field, then explore its job families')
                : (selectedMatch ? `Matched interest tags / ${matchTags(selectedMatch).map(formatTag).join(', ') || 'none supplied'}` : 'Career match results')}</span>
              <span className="guide-active-target">ACTIVE RPG GOAL / {activeTargetCareer?.title || 'NONE SELECTED'}</span>
              <p>{explorerMode === 'catalog'
                ? <>{selectedFamily
                  ? <><b>Click an occupation</b> for its summary; double-click for details. Only the explicit goal button changes your RPG target.</>
                  : selectedField
                    ? <><b>Click a job-family bubble</b> to browse its occupations. Use the field button above to return to all career fields.</>
                    : <><b>Click a colored career-field bubble</b> to explore its job families, then choose a family to see occupations. Only the explicit goal button changes your RPG target.</>}</>
                : <><b>Click a bubble</b> for its summary. Double-click a bubble or summary for details. Search and mute returned interest tags.</>}</p>
              {explorerMode === 'catalog' && <small className="guide-category-note">{catalogMetadata?.verification_notice}</small>}
              {explorerMode === 'catalog' && catalogSource === 'bundled' && <small className="guide-category-note">Live catalog connection unavailable. Showing the bundled 115-occupation reference snapshot.</small>}
              {explorerMode === 'matches' && selectedMatch && <small className="guide-category-note">Career category is not supplied by the matching API.</small>}
              <div className="guide-footer"><span>{explorerMode === 'catalog' ? catalogSource === 'bundled' ? 'BUNDLED CATALOG SNAPSHOT' : 'LIVE REFERENCE CATALOG' : matchSource === 'bundled' ? 'BUNDLED CAREER DATA' : 'LIVE BACKEND DATA'}</span><span>◈ {explorerMode === 'catalog' ? `${allOccupations.length} OCCUPATIONS` : selectedMatch ? `${selectedMatch.interest_score}%` : `${matches.length} MATCHES`}</span></div>
            </aside>
          ) : (
            <button className="guide-dock" type="button" onClick={() => setGuideExpanded(true)} aria-label="Expand Field Guide">
              <span>GUIDE</span><b aria-hidden="true">⌃</b>
            </button>
          )}
        </div>
      </main>
      <footer className="map-footer" inert={careerChatExpanded} aria-hidden={careerChatExpanded}><span>{explorerMode === 'catalog' ? 'JOB FAMILIES ARE BROWSE GROUPS / NOT CAREER GOALS' : 'CAREER LINKS SHOW SHARED INTEREST TAGS'}</span><span>ORQUEST / CAREER MAP</span></footer>

      {detailOpen && (selectedMatch || selectedOccupation) && (
        <div className="career-detail-backdrop" inert={careerChatExpanded} aria-hidden={careerChatExpanded}>
            <section className={`career-detail-panel ${selectedOccupation ? 'catalog-detail-panel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="career-detail-title" style={{ '--bubble-color': selectedOccupation ? careerFieldForFamily(selectedOccupation.family_id, careerFieldGroups).color : selectedColor }}>
            <header className="career-detail-header">
              <button type="button" className="detail-back" aria-label="Back to summary" onClick={() => setDetailOpen(false)}>←</button>
              <div><span>{selectedOccupation ? 'CAREER CATALOG / OCCUPATION RECORD' : 'CAREER FILE / BACKEND DETAIL'}</span><h2 id="career-detail-title">{selectedOccupation?.title || selectedMatch?.title}</h2></div>
              <button type="button" className="detail-close" aria-label="Close career details" onClick={() => { setDetailOpen(false); setSelectedId(''); setSelectedOccupationId('') }}>×</button>
            </header>
            <div className="career-detail-scroll">
              {selectedOccupation ? (
                <CatalogOccupationDetails
                  occupation={occupationDetailRecord}
                  detail={occupationDetails[selectedOccupation.id]}
                  metadata={catalogMetadata}
                  loading={occupationDetailLoading}
                  error={occupationDetailErrors[selectedOccupation.id]}
                  resources={occupationRoadmaps[selectedOccupation.id]}
                  resourcesLoading={occupationRoadmapLoading}
                  resourcesError={occupationRoadmapErrors[selectedOccupation.id]}
                  mdcResources={occupationMdcResources[selectedOccupation.id]}
                  mdcLoading={occupationMdcLoading}
                  mdcError={occupationMdcErrors[selectedOccupation.id]}
                  onRetryMdc={() => loadOccupationDetail(selectedOccupation)}
                  activeTargetCareer={activeTargetCareer}
                  onChooseGoal={() => chooseOccupationAsGoal(selectedOccupation)}
                  onOpenChat={(question) => openCareerChat(question, occupationAsCareerTarget(selectedOccupation))}
                  onRetry={() => loadOccupationDetail(selectedOccupation)}
                  onRetryResources={() => loadOccupationDetail(selectedOccupation)}
                />
              ) : (
                <>
              <p className="detail-tags">Matched interest tags: {matchTags(selectedMatch).map(formatTag).join(', ') || 'not supplied'}</p>
              <button
                className={`career-target-button ${activeTargetCareer?.career_id === selectedMatch.career_id ? 'is-active' : ''}`}
                type="button"
                disabled={activeTargetCareer?.career_id === selectedMatch.career_id}
                onClick={() => onSetActiveTargetCareer?.(selectedMatch)}
              >
                {activeTargetCareer?.career_id === selectedMatch.career_id ? 'ACTIVE RPG GOAL' : 'CHOOSE THIS AS MY GOAL'}
              </button>
              {selectedDetail ? (
                <>
                  <section className="detail-section"><h3>Career description</h3><p>{selectedDetail.summary || 'No career description was supplied.'}</p></section>
                  <section className="detail-section"><h3>Requirements</h3>
                    {selectedDetail.requirements.length ? <ul>{selectedDetail.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : <p>No requirements were supplied.</p>}
                  </section>
                  <ResourceList title="MDC resources" resources={selectedDetail.mdc_resources} />
                  <ResourceList title="External resources" resources={selectedDetail.external_resources} />
                  <section className="detail-section"><h3>Sources</h3>
                    {selectedDetail.sources.length ? <ul>{selectedDetail.sources.map((source, index) => (
                      <li key={`${source.title}-${index}`}>
                        <strong>{source.title}</strong>
                        <small>{source.verification_status}{source.verified_at ? ` · ${source.verified_at}` : ''}</small>
                        {source.url && <a href={source.url} target="_blank" rel="noreferrer">Open source</a>}
                      </li>
                    ))}</ul> : <p>No sources were supplied.</p>}
                  </section>
                </>
              ) : detailErrors[selectedId] ? (
                <div className="detail-load-error" role="alert"><p>Career details are unavailable: {detailErrors[selectedId]}</p><button type="button" className="pixel-button" onClick={retryCareerDetails}>RETRY DETAILS</button></div>
              ) : <p role="status">LOADING CAREER DETAILS…</p>}
              <QuestionPlaceholder onOpenChat={(question) => openCareerChat(question, selectedMatch)} />
                </>
              )}
            </div>
          </section>
        </div>
      )}

      <CareerChatOverlay
        hasOpened={careerChatHasOpened}
        expanded={careerChatExpanded}
        draft={careerChatDraft}
        onDraftChange={setCareerChatDraft}
        onToggle={toggleCareerChat}
        careerTitle={careerChatCareer?.title || selectedMatch?.title || 'this career'}
        chatEntries={careerChatEntries.filter((entry) => entry.career_id === careerChatCareer?.career_id)}
        loading={careerChatLoading}
        error={careerChatError}
        canSend={Boolean(careerChatCareer?.career_id)}
        onSend={sendCareerQuestion}
        personalizationConsent={careerChatPersonalizationConsent}
        onPersonalizationConsentChange={changeCareerChatConsent}
        includePreviousMessages={includePreviousChatMessages}
        onIncludePreviousMessagesChange={changeIncludePreviousChatMessages}
      />
    </section>
  )
}
