import { useEffect, useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import { getSwipeCards } from '../services/api.js'

export default function SwipeScreen({ onComplete, onExit }) {
  const [cards, setCards] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [responses, setResponses] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setLoadError('')
    getSwipeCards({ signal: controller.signal })
      .then((loadedCards) => {
        if (!controller.signal.aborted) {
          setCards(loadedCards)
          setActiveIndex(0)
          setResponses([])
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  const card = cards[activeIndex]

  function answer(preference) {
    if (!card) return
    const nextResponses = [...responses, { card_id: card.id, preference }]
    if (activeIndex === cards.length - 1) {
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
            {isLoading ? (
              <div className="swipe-data-state" role="status">LOADING SHARED SWIPE CARDS…</div>
            ) : loadError ? (
              <div className="swipe-data-state" role="alert">
                <strong>SWIPE CARDS ARE UNAVAILABLE</strong>
                <p>{loadError}</p>
                <button className="pixel-button" type="button" onClick={() => setReload((value) => value + 1)}>RETRY</button>
              </div>
            ) : cards.length === 0 ? (
              <div className="swipe-data-state" role="status">
                <strong>NO SWIPE CARDS ARE AVAILABLE</strong>
                <p>The backend returned an empty card deck.</p>
                <button className="pixel-button" type="button" onClick={() => setReload((value) => value + 1)}>RELOAD CARDS</button>
              </div>
            ) : (
              <>
          <div className="question-panel">
            <div><span className="pixel-kicker">QUESTION ROUTE <i>///</i> {String(activeIndex + 1).padStart(2, '0')} OF {String(cards.length).padStart(2, '0')}</span><h1>What kind of work feels like <em>you?</em></h1></div>
            <span className="question-mark" aria-hidden="true">?</span>
          </div>

          <div className="swipe-board">
            <button className="response-tile response-disagree" type="button" aria-label="Disagree" onClick={() => answer('dislike')}>
              <span className="response-key">A</span><span className="response-icon" aria-hidden="true">×</span><b>DISAGREE</b><small>Not my thing</small>
            </button>

            <article className="interest-card" key={card.id}>
              <div className="answer-card-top"><span>BACKEND CARD / {card.id}</span><span className="card-symbol" aria-hidden="true">{String(activeIndex + 1).padStart(2, '0')}</span></div>
              <div className="interest-card-copy"><span className="answer-label">DOES THIS SOUND LIKE YOU?</span><h2>{card.activity}</h2><p>Choose whether this activity sounds like something you would enjoy.</p></div>
              <div className="interest-tags">{card.interest_tags.map((interest) => <span key={interest}>{interest.replaceAll('_', ' ')}</span>)}</div>
              <span className="answer-corner" aria-hidden="true" />
            </article>

            <button className="response-tile response-agree" type="button" aria-label="Agree" onClick={() => answer('like')}>
              <span className="response-key">D</span><span className="response-icon" aria-hidden="true">✓</span><b>AGREE</b><small>That feels like me</small>
            </button>
          </div>

          <div className="survey-footer"><span><i className="pixel-live" /> LIVE BACKEND DECK / {cards.length} CARDS</span><span>CLICK A OR D TO CONTINUE <b>→</b></span></div>
              </>
            )}
        </div>
      </main>
    </section>
  )
}
