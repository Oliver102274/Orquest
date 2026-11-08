import { useEffect, useRef, useState } from 'react'
import ExperienceLayout from './ExperienceLayout.jsx'
import SavedCareerPaths from './SavedCareerPaths.jsx'
import RpgGuidancePanel from './rpg/RpgGuidancePanel.jsx'
import RpgProgressHeader from './rpg/RpgProgressHeader.jsx'
import RpgMissionCard from './rpg/RpgMissionCard.jsx'
import './RpgGame.css'
import { completeProgressMission, getCareerRoadmap, getProgress, startProgress } from '../services/api.js'
import {
  buildProgressPayload,
  isSessionOverError,
  normalizeRpgTarget,
  progressErrorMessage,
} from '../logic/rpgProgress.js'

function missionNodePositions(missions) {
  const count = missions.length
  const nodeSize = count > 20 ? 40 : count > 12 ? 48 : count > 8 ? 54 : 64
  const outerCount = count > 8 ? Math.ceil(count / 2) : count
  const innerCount = count - outerCount

  return new Map(missions.map((mission, index) => {
    // The API currently supplies no mission levels or prerequisite graph. These
    // orbits are a balanced visual constellation only, never progression data.
    const isInnerOrbit = index >= outerCount
    const orbitIndex = isInnerOrbit ? index - outerCount : index
    const orbitCount = isInnerOrbit ? innerCount : outerCount
    const angleOffset = isInnerOrbit ? Math.PI / Math.max(orbitCount, 1) : 0
    const angle = -Math.PI / 2 + angleOffset + (Math.PI * 2 * orbitIndex) / Math.max(orbitCount, 1)
    const radiusX = isInnerOrbit ? 28 : count > 8 ? 39 : 35
    const radiusY = isInnerOrbit ? 26 : count > 8 ? 37 : 34

    return [mission.id, {
      left: `${50 + Math.cos(angle) * radiusX}%`,
      top: `${50 + Math.sin(angle) * radiusY}%`,
      '--rpg-node-size': `${nodeSize}px`,
    }]
  }))
}

export default function RpgGame({
  activeTargetCareer,
  careerPaths,
  onSelectCareerPath,
  swipePersonalizationConsent,
  quizAnswers,
  quizPersonalizationConsent,
  progressSession,
  onProgressSessionChange,
  onExportSave,
  onBackToExplorer,
}) {
  const [roadmap, setRoadmap] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sessionError, setSessionError] = useState('')
  const [sessionBusy, setSessionBusy] = useState(false)
  const [savingMissionId, setSavingMissionId] = useState('')
  const [selectedMissionId, setSelectedMissionId] = useState('')
  const [showMissionDetails, setShowMissionDetails] = useState(false)
  const [showGuidance, setShowGuidance] = useState(false)
  const [skillsExpanded, setSkillsExpanded] = useState(false)
  const requestController = useRef(null)

  const target = normalizeRpgTarget(activeTargetCareer)
  const progress = progressSession?.progress || null
  const selectedMission = progress?.missions?.find((mission) => mission.id === selectedMissionId)
    || progress?.missions?.[0]
    || null
  const nodePositions = missionNodePositions(progress?.missions || [])

  useEffect(() => () => requestController.current?.abort(), [])

  useEffect(() => {
    requestController.current?.abort()
    setLoading(false)
    setRoadmap(null)
    setError('')
    setSessionError('')
    setSessionBusy(false)
    setSavingMissionId('')
    setSelectedMissionId('')
    setShowMissionDetails(false)
    setShowGuidance(false)
    setSkillsExpanded(false)
  }, [activeTargetCareer?.career_id])

  useEffect(() => {
    if (!showMissionDetails && !showGuidance) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setShowMissionDetails(false)
        setShowGuidance(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showMissionDetails, showGuidance])

  function nextController() {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    return controller
  }

  function storeSession(session) {
    if (target) onProgressSessionChange?.(target.id, session)
  }

  function handleSessionError(requestError, controller) {
    if (requestError.name === 'AbortError' || controller.signal.aborted) return
    setSessionError(progressErrorMessage(requestError))
    if (isSessionOverError(requestError)) storeSession(null)
  }

  async function requestRoadmap() {
    if (!target || loading) return

    const controller = nextController()
    setLoading(true)
    setError('')
    setRoadmap(null)

    const payload = { career_id: target.id }
    const consentedTags = swipePersonalizationConsent ? target.matched_interest_tags : []
    if (consentedTags.length) payload.interest_tags = [...new Set(consentedTags)]
    payload.questionnaire_answers = quizAnswers
    payload.questionnaire_personalization_consent = quizPersonalizationConsent

    try {
      const response = await getCareerRoadmap(payload, { signal: controller.signal })
      if (!controller.signal.aborted) {
        setRoadmap(response)
        setShowGuidance(true)
      }
    } catch (requestError) {
      if (requestError.name !== 'AbortError' && !controller.signal.aborted) setError(requestError.message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  async function beginMissionPath() {
    if (!target || sessionBusy) return

    const payload = buildProgressPayload({
      target,
      interestTags: target.matched_interest_tags,
      swipeConsent: swipePersonalizationConsent,
      answers: quizAnswers,
      quizConsent: quizPersonalizationConsent,
    })
    if (!payload) return

    const controller = nextController()
    setSessionBusy(true)
    setSessionError('')
    setError('')
    setRoadmap(null)
    setShowMissionDetails(false)
    setShowGuidance(false)

    try {
      const session = await startProgress(payload, { signal: controller.signal })
      if (!controller.signal.aborted) storeSession(session)
    } catch (requestError) {
      handleSessionError(requestError, controller)
    } finally {
      if (!controller.signal.aborted) setSessionBusy(false)
    }
  }

  async function refreshMissionPath() {
    if (!progressSession || sessionBusy) return

    const controller = nextController()
    setSessionBusy(true)
    setSessionError('')

    try {
      const refreshed = await getProgress(
        { progressId: progressSession.progress.id, accessToken: progressSession.access_token },
        { signal: controller.signal },
      )
      if (!controller.signal.aborted) onProgressSessionChange?.(target.id, { ...progressSession, progress: refreshed })
    } catch (requestError) {
      handleSessionError(requestError, controller)
    } finally {
      if (!controller.signal.aborted) setSessionBusy(false)
    }
  }

  async function completeMission(mission) {
    if (!progressSession || savingMissionId) return

    const controller = nextController()
    setSavingMissionId(mission.id)
    setSessionError('')

    try {
      const updated = await completeProgressMission(
        {
          progressId: progressSession.progress.id,
          accessToken: progressSession.access_token,
          missionId: mission.id,
        },
        { signal: controller.signal },
      )
      if (!controller.signal.aborted) {
        onProgressSessionChange?.(target.id, { ...progressSession, progress: updated })
        setSelectedMissionId(mission.id)
      }
    } catch (requestError) {
      handleSessionError(requestError, controller)
    } finally {
      if (!controller.signal.aborted) setSavingMissionId('')
    }
  }

  return (
    <ExperienceLayout className="rpg-route" label="Orquest RPG game">
      <div className="rpg-hall-background" aria-hidden="true">
        <div className="concert-hall">
          <div className="hall-ceiling" />
          <div className="hall-balcony balcony-back" />
          <div className="hall-balcony balcony-front" />
          <div className="hall-seat-row seat-row-one" />
          <div className="hall-seat-row seat-row-two" />
          <div className="hall-floor" />
          <div className="conductor-shadow"><span /></div>
        </div>
      </div>

      <main className="rpg-game-shell" aria-label="Career progression game">
        <header className="rpg-hud">
          <div className="rpg-hud-target">
            <span className="rpg-hud-kicker">ORQUEST / PLAYER ONE</span>
            <h1>{activeTargetCareer?.title || 'Choose your career'}</h1>
            <small>{target ? `${target.type === 'occupation' ? 'OCCUPATION' : 'CAREER'} TARGET · ${target.id}` : 'Choose an occupation in Bubble Explorer to begin.'}</small>
            <div className="rpg-target-picker">
              <SavedCareerPaths
                careerPaths={careerPaths}
                activeCareerId={activeTargetCareer?.career_id}
                onSelectCareerPath={onSelectCareerPath}
              />
            </div>
          </div>

          {progress
            ? <RpgProgressHeader progress={progress} target={target} syncing={sessionBusy} onRefresh={refreshMissionPath} />
            : (
              <div className="rpg-hud-no-session">
                <span className="rpg-hud-kicker">CAREER LEVEL</span>
                <strong>NOT AVAILABLE</strong>
                <small>Start a progress session to load missions. Level rules are not in this backend response.</small>
              </div>
            )}

          <nav className="rpg-hud-actions" aria-label="RPG actions">
            {!progress && (
              <button className="rpg-hud-button rpg-hud-primary" type="button" disabled={!target || sessionBusy} onClick={beginMissionPath}>
                {sessionBusy ? 'STARTING…' : 'START PATH'}
              </button>
            )}
            {progress?.roadmap
              ? <button className="rpg-hud-button" type="button" onClick={() => setShowGuidance(true)}>CAREER INFO</button>
              : roadmap
                ? <button className="rpg-hud-button" type="button" onClick={() => setShowGuidance(true)}>VIEW GUIDANCE</button>
                : null}
            {!progress && (
              <button className="rpg-hud-button" type="button" disabled={!target || loading} onClick={requestRoadmap}>
                {loading ? 'LOADING…' : roadmap ? 'UPDATE GUIDANCE' : 'CAREER GUIDANCE'}
              </button>
            )}
            <button className="rpg-hud-button" type="button" onClick={onExportSave}>EXPORT SAVE</button>
            <button className="rpg-hud-button" type="button" onClick={onBackToExplorer}>← EXPLORER</button>
          </nav>
        </header>

        {(sessionError || error) && <p className="rpg-hud-error" role="alert">{sessionError || error}</p>}

        <section className="rpg-map-stage" aria-label="Mission map">
          {progress ? (
            <>
              <div className="rpg-map-caption">
                <span>CAREER CONSTELLATION</span>
                <small>MISSION POSITIONS ARE DECORATIVE · ORDER / LEVEL DATA NOT PROVIDED</small>
              </div>
              <div className="rpg-mission-map" role="group" aria-label="Mission constellation; node positions are decorative">
                <div className="rpg-orbit-guide rpg-orbit-outer" aria-hidden="true" />
                <div className="rpg-orbit-guide rpg-orbit-inner" aria-hidden="true" />
                <div className="rpg-orbit-guide rpg-orbit-core" aria-hidden="true" />
                <div className="rpg-career-node" aria-label={`Career target: ${target?.title || 'selected career'}`}>
                  <span>CAREER</span>
                  <strong>{target?.title || 'Your path'}</strong>
                </div>
                {progress.missions.map((mission) => (
                  <button
                    key={mission.id}
                    className={`rpg-map-node ${mission.completed ? 'is-complete' : ''} ${selectedMission?.id === mission.id && showMissionDetails ? 'is-selected' : ''}`}
                    style={nodePositions.get(mission.id)}
                    type="button"
                    title={mission.title}
                    aria-pressed={selectedMission?.id === mission.id && showMissionDetails}
                    aria-label={`View ${mission.title}; ${mission.completed ? 'complete' : 'not complete'}`}
                    onClick={() => {
                      setSelectedMissionId(mission.id)
                      setShowMissionDetails(true)
                    }}
                  >
                    <span>{mission.completed ? '✓' : '✦'}</span>
                  </button>
                ))}
              </div>
              <div className="rpg-map-legend" aria-label="Mission status legend">
                <span><i className="is-open" /> Not complete</span>
                <span><i className="is-done" /> Complete</span>
              </div>
            </>
          ) : (
            <div className="rpg-map-empty">
              <div className="rpg-empty-orbit" aria-hidden="true"><span /></div>
              <p>{target ? 'Your career node is ready. Start a mission path to load the backend missions.' : 'Choose a career target to place your first node.'}</p>
              {!target && <button className="rpg-hud-button" type="button" onClick={onBackToExplorer}>CHOOSE A CAREER</button>}
              {target && <small>Career levels, mission rings, and prerequisite links are not supplied by the current backend contract.</small>}
            </div>
          )}
        </section>

        <footer className={`rpg-bottom-hud ${skillsExpanded ? 'is-expanded' : ''}`}>
          <button
            className={`rpg-skills-summary ${skillsExpanded ? 'is-expanded' : ''}`}
            type="button"
            title="Double-click to inspect available skill data"
            aria-expanded={skillsExpanded}
            onDoubleClick={() => setSkillsExpanded((value) => !value)}
          >
            <span className="rpg-hud-kicker">SKILLS</span>
            <strong>NO SKILL LINKS</strong>
            <small>{skillsExpanded ? 'DOUBLE-CLICK TO COLLAPSE' : 'DOUBLE-CLICK FOR DETAILS'}</small>
          </button>
          {skillsExpanded && (
            <div className="rpg-skills-detail" aria-live="polite">
              <span>SKILL ARCHIVE</span>
              <p>Mission-to-skill relationships and skill ranks are not included in the current progress data. No skills have been invented or awarded.</p>
            </div>
          )}
          <span className="rpg-bottom-note">Progress is self-reported and temporarily stored.</span>
        </footer>
      </main>

      {showMissionDetails && selectedMission && progress && (
        <div className="rpg-modal-backdrop" role="presentation" onClick={() => setShowMissionDetails(false)}>
          <section className="career-detail-panel rpg-detail-panel" role="dialog" aria-modal="true" aria-labelledby="rpg-selected-mission-title" onClick={(event) => event.stopPropagation()}>
            <header className="career-detail-header">
              <div><span>MISSION FILE / ACTIVE PATH</span><h2 id="rpg-selected-mission-title">{selectedMission.title}</h2></div>
              <button className="detail-close" type="button" aria-label="Close mission details" onClick={() => setShowMissionDetails(false)}>×</button>
            </header>
            <div className="career-detail-scroll">
              <RpgMissionCard
                mission={selectedMission}
                roadmap={progress.roadmap}
                saving={savingMissionId === selectedMission.id}
                onComplete={completeMission}
              />
            </div>
          </section>
        </div>
      )}

      {showGuidance && (progress?.roadmap || roadmap) && (
        <div className="rpg-modal-backdrop" role="presentation" onClick={() => setShowGuidance(false)}>
          <section className="career-detail-panel rpg-guidance-panel" role="dialog" aria-modal="true" aria-labelledby="rpg-guidance-title" onClick={(event) => event.stopPropagation()}>
            <header className="career-detail-header">
              <div><span>CAREER FILE / GUIDANCE</span><h2 id="rpg-guidance-title">{(progress?.roadmap || roadmap).target_occupation.title}</h2></div>
              <button className="detail-close" type="button" aria-label="Close career guidance" onClick={() => setShowGuidance(false)}>×</button>
            </header>
            <div className="career-detail-scroll">
              <RpgGuidancePanel roadmap={progress?.roadmap || roadmap} active={Boolean(progress)} />
            </div>
          </section>
        </div>
      )}
    </ExperienceLayout>
  )
}
