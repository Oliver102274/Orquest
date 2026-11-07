import { useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import { swipeCards } from '../data/demoData.js'

export default function SwipeScreen({ onComplete, onExit }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [responses, setResponses] = useState([])
  const card = swipeCards[activeIndex]

  function answer(preference) {
    const nextResponses = [...responses, { card_id: card.id, preference }]
    if (activeIndex === swipeCards.length - 1) {
      onComplete(nextResponses)
      return
    }
    setResponses(nextResponses)
    setActiveIndex((index) => index + 1)
  }

  return (
    <section className="swipe-screen">
      <div className="swipe-orbs" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <header className="game-header">
        <OrquestLogo compact />
        <div className="game-level"><span>LEVEL 01</span><b>INTEREST QUEST</b></div>
        <button className="pixel-quiet-button" type="button" onClick={onExit}>QUIT DEMO <span aria-hidden="true">↗</span></button>
      </header>

      <main className="swipe-playfield">
        <div className="pixel-survey-frame">
          <div className="question-panel">
            <div><span className="pixel-kicker">QUESTION ROUTE <i>///</i> {String(activeIndex + 1).padStart(2, '0')} OF {String(swipeCards.length).padStart(2, '0')}</span><h1>What kind of work feels like <em>you?</em></h1></div>
            <span className="question-mark" aria-hidden="true">?</span>
          </div>

          <div className="swipe-board">
            <button className="response-tile response-disagree" type="button" aria-label="Disagree" onClick={() => answer('dislike')}>
              <span className="response-key">A</span><span className="response-icon" aria-hidden="true">×</span><b>DISAGREE</b><small>Not my thing</small>
            </button>

            <article className={`interest-card card-${card.color}`} key={card.id}>
              <div className="answer-card-top"><span>YOUR CHOICE / {String(activeIndex + 1).padStart(2, '0')}</span><span className="card-symbol" aria-hidden="true">{card.icon}</span></div>
              <div className="interest-card-copy"><span className="answer-label">DOES THIS SOUND LIKE YOU?</span><h2>{card.title}</h2><p>{card.prompt}</p></div>
              <div className="interest-tags">{card.interests.map((interest) => <span key={interest}>{interest}</span>)}</div>
              <span className="answer-corner" aria-hidden="true" />
            </article>

            <button className="response-tile response-agree" type="button" aria-label="Agree" onClick={() => answer('like')}>
              <span className="response-key">D</span><span className="response-icon" aria-hidden="true">✓</span><b>AGREE</b><small>That feels like me</small>
            </button>
          </div>

          <div className="survey-footer"><span><i className="pixel-live" /> DEMO RUN / YOUR ANSWERS STAY LOCAL</span><span>CLICK A OR D TO CONTINUE <b>→</b></span></div>
        </div>
      </main>
    </section>
  )
}
