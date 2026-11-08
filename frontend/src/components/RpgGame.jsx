import { resolveOccupationId } from '../data/careerOccupationMap.js'
import { getOccupationResources } from '../services/api'
import { useEffect, useRef, useState } from 'react'
import ExperienceLayout from './ExperienceLayout.jsx'
import SavedCareerPaths from './SavedCareerPaths.jsx'
import { getCareerRoadmap, startProgress, completeMission } from '../services/api.js'

function ResourceSection({ title, resources }) {
  if (!resources.length) return null
  return (
    <section className="roadmap-section">
      <h3>{title}</h3>
      <ul>
        {resources.map((resource) => (
          <li key={resource.id}>
            <strong>{resource.title}</strong>
            <small>{resource.organization} · {resource.type} · {resource.verification_status}</small>
            {resource.source_url && <a href={resource.source_url} target="_blank" rel="noreferrer">Open source</a>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RoadmapResult({ roadmap, active = false }) {
  const blocked = roadmap.metadata.status === 'blocked'
  const missionSuggestions = roadmap.suggested_missions
  const sourceUrls = [...new Set(roadmap.source_urls)]

  return (
    <section className="roadmap-panel" aria-labelledby="roadmap-result-title">
      <span className={`roadmap-status status-${roadmap.metadata.status}`}>
        {roadmap.metadata.status === 'ai_generated' ? `AI-GENERATED DRAFT${roadmap.metadata.review_required ? ' / REVIEW REQUIRED' : ''}`
          : roadmap.metadata.status === 'deterministic' ? 'DETERMINISTIC CATALOG GUIDANCE'
            : 'ROADMAP UNAVAILABLE'}
      </span>
      <h2 id="roadmap-result-title">Roadmap for {roadmap.target_occupation.title}</h2>
      {blocked ? (
        <p className="roadmap-error" role="status">The backend could not safely provide roadmap suggestions. No suggested steps are shown.</p>
      ) : (
        <>
          <p className="roadmap-review-note">{active ? 'Practice missions are tracked temporarily below; completion is self-reported, not a qualification.' : 'These are roadmap suggestions, not active RPG missions. No progress or rewards are recorded.'}</p>

          {roadmap.relevant_skills_and_qualifications.length > 0 && (
            <section className="roadmap-section">
              <h3>Relevant skills and qualifications</h3>
              <ul>{roadmap.relevant_skills_and_qualifications.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </section>
          )}

          <ResourceSection title="MDC pathways to investigate" resources={roadmap.mdc_pathways} />
          <ResourceSection title="Alternative resources to investigate" resources={roadmap.alternative_resources} />

          {missionSuggestions.length > 0 && (
            <section className="roadmap-section">
              <h3>Suggested roadmap steps</h3>
              <ul>
                {missionSuggestions.map((step) => (
                  <li key={step.id}>
                    <strong>{step.title}</strong>
                    <p>{step.instruction}</p>
                    {step.resource_ids.length > 0 && <small>Related resource IDs: {step.resource_ids.join(', ')}</small>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {roadmap.evidence_gaps.length > 0 && (
            <section className="roadmap-section">
              <h3>Evidence gaps</h3>
              <ul>{roadmap.evidence_gaps.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}</ul>
            </section>
          )}

          {sourceUrls.length > 0 && (
            <section className="roadmap-section">
              <h3>Sources</h3>
              <ul>{sourceUrls.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul>
            </section>
          )}
        </>
      )}
    </section>
  )
}


function EducationalResources({ occupationId }) {
  const [resources, setResources] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!occupationId?.startsWith('occupation_')) {
      setResources(null)
      setError('')
      setLoading(false)
      return
    }

    const controller = new AbortController()

    setResources(null)
    setLoading(true)
    setError('')

    getOccupationResources(occupationId, {
      signal: controller.signal,
    })
      .then(data => {
        if (!controller.signal.aborted) setResources(data)
      })
      .catch(err => {
        if (!controller.signal.aborted) setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [occupationId])

  if (!occupationId?.startsWith('occupation_')) return null

  return (
    <section className="roadmap-panel" aria-label="Educational resources">
      <h2>Educational Resources</h2>
      <p>
        Explore possible training pathways for your selected occupation.
        Discovered programs are not verified qualifications.
      </p>

      {loading && <p role="status">Finding educational resources...</p>}
      {error && <p className="roadmap-error" role="alert">{error}</p>}

      {resources && (
        <>
          <section className="roadmap-section">
            <h3>MDC Programs — SOC Matches</h3>
            {resources.resources.length ? (
              <ul>
                {resources.resources.map(item => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.organization} — Unverified candidate</p>
                    {item.source_url && (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                        View official catalog
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p>No exact MDC matches found.</p>}
          </section>

          <section className="roadmap-section">
            <h3>Related MDC Programs</h3>
            {resources.related_resources.length ? (
              <ul>
                {resources.related_resources.map(item => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <p>Potential match — not individually verified</p>
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                      View MDC catalog
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p>No related MDC candidates found.</p>}
          </section>

          <section className="roadmap-section">
            <h3>Explore Additional Training</h3>
            <ul>
              {resources.external_search_options.map(item => (
                <li key={item.url}>
                  <strong>{item.title}</strong>
                  <p>Search for: {item.search_term}</p>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    Open training directory
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  )
}

export default function RpgGame({ activeTargetCareer, careerPaths, onSelectCareerPath, swipePersonalizationConsent, quizAnswers, quizPersonalizationConsent, onExportSave, onBackToExplorer, progressSession, onProgressChange }) {
  const [roadmap, setRoadmap] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestController = useRef(null)

  useEffect(() => () => requestController.current?.abort(), [])

  useEffect(() => {
    requestController.current?.abort()
    setLoading(false)
    setRoadmap(null)
    setError('')
  }, [activeTargetCareer?.career_id])

  async function requestRoadmap() {
    if (!activeTargetCareer?.career_id || loading) return

    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setLoading(true)
    setError('')
    setRoadmap(null)

    const payload = roadmapPayload()
    try {
      const response = await getCareerRoadmap(payload, { signal: controller.signal })
      if (!controller.signal.aborted) setRoadmap(response)
    } catch (requestError) {
      if (requestError.name !== 'AbortError' && !controller.signal.aborted) setError(requestError.message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  function roadmapPayload() {
    const payload = { career_id: activeTargetCareer.career_id }
    const consentedTags = swipePersonalizationConsent && Array.isArray(activeTargetCareer.matched_interest_tags)
      ? [...new Set(activeTargetCareer.matched_interest_tags)]
      : []
    if (consentedTags.length) payload.interest_tags = consentedTags
    payload.questionnaire_answers = quizAnswers
    payload.questionnaire_personalization_consent = quizPersonalizationConsent
    return payload
  }

  async function updateProgress(missionId) {
    if (!activeTargetCareer || loading) return
    const controller = new AbortController()
    requestController.current?.abort()
    requestController.current = controller
    setLoading(true)
    setError('')
    try {
      const session = missionId
        ? { ...progressSession, progress: await completeMission(progressSession, missionId, { signal: controller.signal }) }
        : await startProgress(roadmapPayload(), { signal: controller.signal })
      if (!controller.signal.aborted) onProgressChange(session)
    } catch (requestError) {
      if (requestError.name !== 'AbortError' && !controller.signal.aborted) setError(requestError.message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  return (
    <ExperienceLayout className="rpg-route" label="Orquest RPG game">
      <article className="experience-card rpg-card">
        <span className="experience-kicker">ORQUEST / PLAYER ONE</span>
        <h1>Your journey begins.</h1>
        <p className="rpg-welcome">Welcome to the first step of your Orquest adventure.</p>
        <div className="journey-path-card">
          <span>ACTIVE RPG TARGET</span>
          <strong>{activeTargetCareer?.title || 'No target selected yet'}</strong>
          {!activeTargetCareer && <small>Choose an occupation as your goal from the Bubble Explorer before requesting a roadmap.</small>}
        </div>
        <SavedCareerPaths
          careerPaths={careerPaths}
          activeCareerId={activeTargetCareer?.career_id}
          onSelectCareerPath={onSelectCareerPath}
        />

        {!progressSession && <button className="roadmap-request-button" type="button" disabled={!activeTargetCareer || loading} onClick={requestRoadmap}>
          <span>{loading ? 'REQUESTING ROADMAP…' : roadmap ? 'REQUEST UPDATED ROADMAP' : 'REQUEST CAREER ROADMAP'}</span><span aria-hidden="true">→</span>
        </button>}
        {error && <p className="roadmap-error" role="alert">{error}</p>}
        {progressSession ? <section className="roadmap-panel" aria-label="Temporary mission progress">
          <h2>Practice missions</h2>
          <p role="status">Demo XP: {progressSession.progress.total_xp}</p>
          <p>{progressSession.progress.notice} Reloading this page loses access; save exports do not include missions or XP.</p>
          <ul>{progressSession.progress.missions.map(mission => <li key={mission.id}>
            <strong>{mission.title}</strong><p>{mission.instruction}</p>
            <button className="career-target-button" type="button" disabled={loading || mission.completed} onClick={() => updateProgress(mission.id)}>
              {mission.completed ? 'Completed' : `Complete mission (+${mission.xp_reward} XP)`}
            </button>
          </li>)}</ul>
          <RoadmapResult roadmap={progressSession.progress.roadmap} active />
        </section> : <button className="career-target-button" type="button" disabled={!activeTargetCareer || loading} onClick={() => updateProgress()}>
          START TEMPORARY MISSIONS
        </button>}
        {roadmap && !progressSession && <RoadmapResult roadmap={roadmap} />}
        {!roadmap && !progressSession && !error && !loading && (
          <section className="quest-placeholder">
            <h2>Roadmap guidance</h2>
            <p>Request guidance for your active target to review supplied pathways, resources, and suggested next steps.</p>
            <small>Suggestions are not active missions; progress and rewards are not tracked.</small>
          </section>
        )}
        <EducationalResources
          key={activeTargetCareer?.career_id || 'none'}
          occupationId={resolveOccupationId(activeTargetCareer?.career_id)}
        />
        <div className="journey-secondary-actions">
          <button className="save-export-button" type="button" onClick={onExportSave}>EXPORT SAVED PROGRESS</button>
          <button className="pixel-quiet-button experience-back-button" type="button" onClick={onBackToExplorer}>← Return to Bubble Explorer</button>
        </div>
      </article>
    </ExperienceLayout>
  )
}
