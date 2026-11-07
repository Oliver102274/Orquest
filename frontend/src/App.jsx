import { useState } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import SwipeScreen from './components/SwipeScreen.jsx'
import BubbleExplorer from './components/BubbleExplorer.jsx'
import OptionalQuiz from './components/OptionalQuiz.jsx'
import StartYourJourney from './components/StartYourJourney.jsx'
import RpgGame from './components/RpgGame.jsx'
import { grantQuizPersonalizationConsent, initialPersonalizationConsents, setPersonalizationConsent } from './logic/personalizationConsent.js'

export default function App() {
  const [screen, setScreen] = useState('login')
  const [responses, setResponses] = useState([])
  const [experienceScreen, setExperienceScreen] = useState(null)
  const [quizAnswers, setQuizAnswers] = useState([])
  const [selectedCareer, setSelectedCareer] = useState(null)
  const [personalizationConsents, setPersonalizationConsents] = useState(initialPersonalizationConsents)

  function finishSwipe(nextResponses) {
    setResponses(nextResponses)
    setScreen('bubbles')
  }

  function updatePersonalizationConsent(source, value) {
    setPersonalizationConsents((current) => setPersonalizationConsent(current, source, value))
  }

  function completeQuiz() {
    setPersonalizationConsents((current) => grantQuizPersonalizationConsent(current))
    setExperienceScreen('journey')
  }

  function resetDemo() {
    setResponses([])
    setExperienceScreen(null)
    setQuizAnswers([])
    setSelectedCareer(null)
    setPersonalizationConsents(initialPersonalizationConsents)
    setScreen('login')
  }

  return (
    <main className="app-shell">
      {screen === 'login' && <LoginScreen onLogin={() => setScreen('swipe')} />}
      {screen === 'swipe' && (
        <SwipeScreen
          onComplete={finishSwipe}
          onExit={resetDemo}
          personalizationConsent={personalizationConsents.swipes}
          onPersonalizationConsentChange={(value) => updatePersonalizationConsent('swipes', value)}
        />
      )}
      {screen === 'bubbles' && (
        <>
          <div className={`experience-background ${experienceScreen ? 'is-softened' : ''}`} inert={Boolean(experienceScreen)} aria-hidden={Boolean(experienceScreen)}>
            <BubbleExplorer
              responses={responses}
              onExit={resetDemo}
              onEnterRpg={() => setExperienceScreen('quiz')}
              onCareerSelection={setSelectedCareer}
              careerChatPersonalizationConsent={personalizationConsents.careerChat}
              onCareerChatPersonalizationConsentChange={(value) => updatePersonalizationConsent('careerChat', value)}
            />
          </div>
          {experienceScreen === 'quiz' && (
            <OptionalQuiz
              answers={quizAnswers}
              onAnswersChange={setQuizAnswers}
              onComplete={completeQuiz}
              onSkipQuiz={() => setExperienceScreen('journey')}
              onBackToExplorer={() => setExperienceScreen(null)}
            />
          )}
          {experienceScreen === 'journey' && (
            <StartYourJourney
              selectedCareer={selectedCareer}
              onStart={() => setExperienceScreen('rpg')}
              onBackToExplorer={() => setExperienceScreen(null)}
            />
          )}
          {experienceScreen === 'rpg' && (
            <RpgGame selectedCareer={selectedCareer} onBackToExplorer={() => setExperienceScreen(null)} />
          )}
        </>
      )}
    </main>
  )
}
