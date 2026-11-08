import { useState } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import SwipeScreen from './components/SwipeScreen.jsx'
import BubbleExplorer from './components/BubbleExplorer.jsx'
import OptionalQuiz from './components/OptionalQuiz.jsx'
import StartYourJourney from './components/StartYourJourney.jsx'
import RpgGame from './components/RpgGame.jsx'
import { grantQuizPersonalizationConsent, initialPersonalizationConsents, setPersonalizationConsent } from './logic/personalizationConsent.js'
import { createSaveFile } from './logic/saveFile.js'
import { matchCareerDiscoveryResponses } from './logic/careerDiscoveryMatching.js'

export default function App() {
  const [screen, setScreen] = useState('login')
  const [responses, setResponses] = useState([])
  const [discoveryMatches, setDiscoveryMatches] = useState(null)
  const [discoveryMatchSource, setDiscoveryMatchSource] = useState(null)
  const [experienceScreen, setExperienceScreen] = useState(null)
  const [quizAnswers, setQuizAnswers] = useState([])
  const [exploredCareers, setExploredCareers] = useState([])
  const [careerPaths, setCareerPaths] = useState([])
  const [activeTargetCareer, setActiveTargetCareer] = useState(null)
  const [personalizationConsents, setPersonalizationConsents] = useState(initialPersonalizationConsents)
  // Phase 15 RPG progress sessions, keyed by target id. The access token lives in
  // memory only: it is never persisted and never written into an exported save file.
  const [progressSessions, setProgressSessions] = useState({})

  function updateProgressSession(targetId, session) {
    if (!targetId) return
    setProgressSessions((current) => {
      const next = { ...current }
      if (session) next[targetId] = session
      else delete next[targetId]
      return next
    })
  }

  function updatePersonalizationConsent(source, value) {
    setPersonalizationConsents((current) => setPersonalizationConsent(current, source, value))
  }

  function recordCareerExplored(career) {
    setExploredCareers((current) => current.some((item) => item.career_id === career.career_id)
      ? current
      : [...current, career])
  }

  function chooseActiveTargetCareer(career) {
    if (!career?.career_id) return
    setCareerPaths((current) => current.some((path) => path.career_id === career.career_id)
      ? current
      : [...current, {
          career_id: career.career_id,
          title: career.title,
          matched_interest_tags: Array.isArray(career.matched_interest_tags) ? career.matched_interest_tags : [],
        }])
    setActiveTargetCareer(career)
  }

  function exportSavedProgress() {
    const saveFile = createSaveFile({
      responses,
      exploredCareers,
      careerPaths,
      activeTargetCareer,
      personalizationConsents,
      quizAnswers,
    })
    const blob = new Blob([JSON.stringify(saveFile, null, 2)], { type: 'application/json' })
    const objectUrl = URL.createObjectURL(blob)
    const download = document.createElement('a')
    download.href = objectUrl
    download.download = `orquest-save-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(download)
    download.click()
    download.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  function importSavedProgress(saveFile) {
    const { data } = saveFile
    setResponses(data.swipe_responses)
    setDiscoveryMatches(null)
    setDiscoveryMatchSource(null)
    setExploredCareers(data.explored_career_ids.map((career_id) => ({ career_id })))
    setCareerPaths(data.career_paths)
    setActiveTargetCareer(data.career_paths.find((path) => path.career_id === data.active_career_id) || null)
    setQuizAnswers(data.questionnaire_answers || [])
    setPersonalizationConsents({
      quiz: data.personalization_consents.quiz,
      swipes: data.personalization_consents.swipes,
      careerChat: false,
    })
    setProgressSessions({})
    setExperienceScreen(null)
    setScreen('bubbles')
  }

  function completeQuiz() {
    setPersonalizationConsents((current) => grantQuizPersonalizationConsent(current))
    setExperienceScreen('journey')
  }

  async function completeDiscovery(discovery) {
    try {
      const matches = matchCareerDiscoveryResponses(discovery)
      setResponses([])
      setDiscoveryMatches(matches)
      setDiscoveryMatchSource(matches.careerDiscoverySource)
      setScreen('bubbles')
      return null
    } catch (error) {
      return error.message || 'Bubble matching could not be completed. Please retry.'
    }
  }

  function skipCareerDiscovery() {
    // Skipping creates no survey answers, no negative responses, and no match score.
    // The Bubble Explorer opens directly in its full career-catalog view.
    setResponses([])
    setDiscoveryMatches([])
    setDiscoveryMatchSource('skipped')
    setPersonalizationConsents((current) => setPersonalizationConsent(current, 'swipes', false))
    setExperienceScreen(null)
    setScreen('bubbles')
  }

  function skipQuiz() {
    setQuizAnswers([])
    setPersonalizationConsents((current) => setPersonalizationConsent(current, 'quiz', false))
    setExperienceScreen('journey')
  }

  function resetDemo() {
    setProgressSessions({})
    setResponses([])
    setDiscoveryMatches(null)
    setDiscoveryMatchSource(null)
    setExperienceScreen(null)
    setQuizAnswers([])
    setExploredCareers([])
    setCareerPaths([])
    setActiveTargetCareer(null)
    setPersonalizationConsents(initialPersonalizationConsents)
    setScreen('login')
  }

  function confirmStartFresh() {
    const hasProgress = responses.length > 0 || careerPaths.length > 0 || quizAnswers.some((answer) => answer?.trim())
    if (hasProgress && !window.confirm('Starting fresh clears this demo session. Export saved progress first if you want to keep it. Continue?')) return
    resetDemo()
  }

  return (
    <main className="app-shell">
      {screen === 'login' && <LoginScreen onLogin={() => setScreen('swipe')} onImportSave={importSavedProgress} />}
      {screen === 'swipe' && (
        <SwipeScreen
          onComplete={completeDiscovery}
          onExit={resetDemo}
          onSkipDiscovery={skipCareerDiscovery}
          personalizationConsent={personalizationConsents.swipes}
          onPersonalizationConsentChange={(value) => updatePersonalizationConsent('swipes', value)}
        />
      )}
      {screen === 'bubbles' && (
        <>
          <div className={`experience-background ${experienceScreen ? 'is-softened' : ''}`} inert={Boolean(experienceScreen)} aria-hidden={Boolean(experienceScreen)}>
            <BubbleExplorer
              responses={responses}
              onExit={confirmStartFresh}
              providedMatches={discoveryMatches}
              matchSource={discoveryMatchSource}
              onEnterRpg={() => setExperienceScreen('quiz')}
              onCareerExploration={recordCareerExplored}
              exploredCareerIds={exploredCareers.map((career) => career.career_id)}
              activeTargetCareer={activeTargetCareer}
              onSetActiveTargetCareer={chooseActiveTargetCareer}
              onExportSave={exportSavedProgress}
              careerChatPersonalizationConsent={personalizationConsents.careerChat}
              onCareerChatPersonalizationConsentChange={(value) => updatePersonalizationConsent('careerChat', value)}
            />
          </div>
          {experienceScreen === 'quiz' && (
            <OptionalQuiz
              answers={quizAnswers}
              onAnswersChange={setQuizAnswers}
              onComplete={completeQuiz}
              onSkipQuiz={skipQuiz}
              onBackToExplorer={() => setExperienceScreen(null)}
            />
          )}
          {experienceScreen === 'journey' && (
            <StartYourJourney
              activeTargetCareer={activeTargetCareer}
              careerPaths={careerPaths}
              onSelectCareerPath={setActiveTargetCareer}
              onExportSave={exportSavedProgress}
              onStart={() => setExperienceScreen('rpg')}
              onBackToExplorer={() => setExperienceScreen(null)}
            />
          )}
          {experienceScreen === 'rpg' && (
            <RpgGame
              activeTargetCareer={activeTargetCareer}
              careerPaths={careerPaths}
              onSelectCareerPath={setActiveTargetCareer}
              swipePersonalizationConsent={personalizationConsents.swipes}
              quizAnswers={quizAnswers}
              quizPersonalizationConsent={personalizationConsents.quiz}
              progressSession={activeTargetCareer ? progressSessions[activeTargetCareer.career_id] || null : null}
              onProgressSessionChange={updateProgressSession}
              onExportSave={exportSavedProgress}
              onBackToExplorer={() => setExperienceScreen(null)}
            />
          )}
        </>
      )}
    </main>
  )
}
