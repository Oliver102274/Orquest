import { useEffect, useMemo, useRef, useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import CareerChatOverlay from './CareerChatOverlay.jsx'
import JobCatalogPicker from './JobCatalogPicker.jsx'
import { getCareer, getCareerMatches, submitCareerQuestion } from '../services/api.js'

const TAG_COLORS = ['#91c6a0', '#8fb7cf', '#b99bd3', '#d39bb8', '#d6b887', '#94c2c5', '#b4c68c', '#a3a6d5']

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

export default function BubbleExplorer({
  responses,
  onExit,
  onEnterRpg,
  onCareerExploration,
  exploredCareerIds = [],
  activeTargetCareer,
  onSetActiveTargetCareer,
  onExportSave,
  careerChatPersonalizationConsent,
  onCareerChatPersonalizationConsentChange,
}) {
  const [matches, setMatches] = useState([])
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalogTarget, setCatalogTarget] = useState(null)
  const catalogController = useRef(null)
  const [matchStatus, setMatchStatus] = useState('loading')
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
  const clickTimer = useRef(null)
  const careerChatController = useRef(null)

  const responsesJson = JSON.stringify(responses)
  useEffect(() => {
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
  }, [responsesJson, retryMatches])

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

  useEffect(() => () => {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    careerChatController.current?.abort()
    catalogController.current?.abort()
  }, [])

  const tags = useMemo(() => [...new Set(matches.flatMap(matchTags))], [matches])
  const tagColors = useMemo(() => new Map(tags.map((tag, index) => [tag, TAG_COLORS[index % TAG_COLORS.length]])), [tags])
  const normalizedQuery = query.trim().toLowerCase()
  const visibleMatches = useMemo(() => matches.filter((match) =>
    matchesSearch(match, careerDetails[match.career_id], normalizedQuery)
  ), [matches, careerDetails, normalizedQuery])
  const positions = useMemo(() => layoutMatches(matches), [matches])
  const selectedMatch = matches.find((match) => match.career_id === selectedId) || (catalogTarget?.career_id === selectedId ? catalogTarget : null)
  const selectedDetail = selectedId ? careerDetails[selectedId] : null
  const selectedColor = colorForTag(primaryTag(selectedMatch || {}), tagColors)
  const enabledCount = tags.filter((tag) => enabledTags.has(tag)).length

  function toggleTag(tag) {
    setEnabledTags((current) => {
      const next = new Set(current)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
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
    if (selectedId.startsWith('occupation_') && catalogTarget) { selectOccupation(catalogTarget); return }
    setRetryDetails((value) => value + 1)
  }

  async function selectOccupation(target) {
    catalogController.current?.abort()
    const controller = new AbortController()
    catalogController.current = controller
    setCatalogTarget(target)
    setSelectedId(target.career_id)
    setDetailOpen(true)
    setDetailErrors(current => ({ ...current, [target.career_id]: null }))
    onCareerExploration?.(target)
    try {
      const detail = await getCareer(target.career_id, { signal: controller.signal })
      if (!controller.signal.aborted) setCareerDetails(current => ({ ...current, [target.career_id]: detail }))
    } catch (error) {
      if (!controller.signal.aborted) setDetailErrors(current => ({ ...current, [target.career_id]: error.message }))
    }
  }

  function openCareerChat(question, career) {
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
      setCareerChatEntries((current) => [...current, {
        career_id: careerChatCareer.career_id,
        question: trimmedQuestion,
        answer: blocked ? '' : response.answer,
        source_urls: blocked ? [] : response.source_urls,
        resource_ids: blocked ? [] : response.resource_ids,
        metadata: response.metadata,
      }])
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
            placeholder="Search careers, fields, or pathways..."
          />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
        </label>
        <div className="map-header-status"><i /> {matchStatus === 'loading' ? 'LOADING MATCHES' : matchStatus === 'error' ? 'API UNAVAILABLE' : `${matches.length} BACKEND MATCHES`}</div>
        <div className="map-header-actions">
          <button className="save-export-button save-export-compact" type="button" aria-label="Export saved progress" onClick={onExportSave}>SAVE</button>
          <button className="pixel-quiet-button" type="button" onClick={onExit}>RESTART <span aria-hidden="true">↻</span></button>
        </div>
      </header>

      <main className="map-frame" inert={detailOpen || careerChatExpanded} aria-hidden={detailOpen || careerChatExpanded}>
        <button className="career-target-button" type="button" aria-expanded={catalogOpen} onClick={() => setCatalogOpen(value => !value)}>BROWSE JOB CATALOG</button>
        {catalogOpen && <JobCatalogPicker onSelect={selectOccupation} />}
        <div className="map-filterbar">
          <div className="filter-title"><span>MATCH TAG FILTERS</span><small>CLICK TO MUTE / LIGHT</small></div>
          <div className="map-filter-list" aria-label="Backend interest tag filters">
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
        </div>

        <div className={`map-canvas ${matches.length > 20 ? 'map-dense' : ''}`}>
          <svg className="map-links" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">{edges}</svg>
          {matches.map((match) => {
            const position = positions.get(match.career_id)
            const tag = primaryTag(match)
            const familyVisible = !tag || enabledTags.has(tag)
            const isMatch = matchesSearch(match, careerDetails[match.career_id], normalizedQuery)
            const isSelected = selectedId === match.career_id
            const wasExplored = exploredCareerIds.includes(match.career_id)
            const isActiveTarget = activeTargetCareer?.career_id === match.career_id
            const color = colorForTag(tag, tagColors)
            return (
              <button
                key={match.career_id}
                className={`career-node ${familyVisible ? '' : 'is-muted'} ${normalizedQuery && isMatch ? 'is-search-match' : ''} ${normalizedQuery && !isMatch ? 'is-search-dim' : ''} ${isSelected ? 'is-selected' : ''}`}
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

          {matchStatus === 'loading' && <div className="map-empty-state" role="status">CALCULATING MATCHES FROM YOUR SWIPES…</div>}
          {matchStatus === 'error' && (
            <div className="map-empty-state map-error-state" role="alert">
              <strong>CAREER MATCHES ARE UNAVAILABLE</strong>
              <p>{matchError}</p>
              <button className="pixel-button" type="button" onClick={() => setRetryMatches((value) => value + 1)}>RETRY MATCHES</button>
            </div>
          )}
          {matchStatus === 'ready' && matches.length === 0 && (
            <div className="map-empty-state" role="status">
              <strong>NO CAREER MATCHES RETURNED</strong>
              <p>The backend found no positive interest alignment for these responses.</p>
            </div>
          )}
          {matchStatus === 'ready' && matches.length > 0 && visibleMatches.length === 0 && (
            <div className="map-no-match" role="status">NO MATCHING CAREER / TRY ANOTHER SEARCH</div>
          )}

          {selectedMatch && !detailOpen && (
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

          {guideExpanded ? (
            <aside className="map-guide">
              <div className="guide-title"><i>?</i> FIELD GUIDE <small>SELECTED</small>
                <button type="button" aria-label="Collapse Field Guide" onClick={() => setGuideExpanded(false)}>⌄</button>
              </div>
              <strong className="guide-selection">{selectedMatch?.title || 'Career map'}</strong>
              <span className="guide-family">{selectedMatch ? `Match tags / ${matchTags(selectedMatch).map(formatTag).join(', ') || 'none supplied'}` : 'Backend match results'}</span>
              <span className="guide-active-target">ACTIVE RPG GOAL / {activeTargetCareer?.title || 'NONE SELECTED'}</span>
              <p><b>Click a bubble</b> for its summary. Double-click a bubble or summary for details. Search and mute returned interest-tag families.</p>
              {selectedMatch && <small className="guide-category-note">Career category is not supplied by the current API.</small>}
              <div className="guide-footer"><span>LIVE BACKEND DATA</span><span>◈ {selectedMatch ? `${selectedMatch.interest_score}%` : `${matches.length} MATCHES`}</span></div>
            </aside>
          ) : (
            <button className="guide-dock" type="button" onClick={() => setGuideExpanded(true)} aria-label="Expand Field Guide">
              <span>GUIDE</span><b aria-hidden="true">⌃</b>
            </button>
          )}
        </div>
      </main>
      <footer className="map-footer" inert={careerChatExpanded} aria-hidden={careerChatExpanded}><span>CAREER LINKS SHOW SHARED BACKEND INTEREST TAGS</span><span>ORQUEST / API MAP</span></footer>

      {detailOpen && selectedMatch && (
        <div className="career-detail-backdrop" inert={careerChatExpanded} aria-hidden={careerChatExpanded}>
          <section className="career-detail-panel" role="dialog" aria-modal="true" aria-labelledby="career-detail-title" style={{ '--bubble-color': selectedColor }}>
            <header className="career-detail-header">
              <button type="button" className="detail-back" aria-label="Back to summary" onClick={() => setDetailOpen(false)}>←</button>
              <div><span>CAREER FILE / BACKEND DETAIL</span><h2 id="career-detail-title">{selectedMatch.title}</h2></div>
              <button type="button" className="detail-close" aria-label="Close career details" onClick={() => { setDetailOpen(false); setSelectedId('') }}>×</button>
            </header>
            <div className="career-detail-scroll">
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
                  <section className="detail-section"><h3>Career description</h3><p>{selectedDetail.summary || 'No career description was supplied.'}</p>
                    {selectedId.startsWith('occupation_') && <p>Reference catalog information; unverified unless its source is explicitly marked verified. Typical education is not a universal job requirement.</p>}
                  </section>
                  <section className="detail-section"><h3>Requirements</h3>
                    {selectedDetail.requirements.length ? <ul>{selectedDetail.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : <p>No requirements were supplied.</p>}
                  </section>
                  <ResourceList title="MDC resources" resources={selectedDetail.mdc_resources} />
                  {!selectedDetail.mdc_resources.length && <p>No verified MDC pathway is available for this job yet.</p>}
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
            </div>
            <QuestionPlaceholder onOpenChat={(question) => openCareerChat(question, selectedMatch)} />
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
        onPersonalizationConsentChange={onCareerChatPersonalizationConsentChange}
      />
    </section>
  )
}
