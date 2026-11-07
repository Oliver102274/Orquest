import { useState } from 'react'
import LoginScreen from './components/LoginScreen.jsx'
import SwipeScreen from './components/SwipeScreen.jsx'
import BubbleExplorer from './components/BubbleExplorer.jsx'

export default function App() {
  const [screen, setScreen] = useState('login')
  const [responses, setResponses] = useState([])

  function finishSwipe(nextResponses) {
    setResponses(nextResponses)
    setScreen('bubbles')
  }

  function resetDemo() {
    setResponses([])
    setScreen('login')
  }

  return (
    <main className="app-shell">
      {screen === 'login' && <LoginScreen onLogin={() => setScreen('swipe')} />}
      {screen === 'swipe' && (
        <SwipeScreen onComplete={finishSwipe} onExit={resetDemo} />
      )}
      {screen === 'bubbles' && (
        <BubbleExplorer responses={responses} onExit={resetDemo} />
      )}
    </main>
  )
}
