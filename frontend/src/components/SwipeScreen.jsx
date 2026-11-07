import { useEffect, useRef, useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import { getSwipeCards } from '../services/api.js'

const SWIPE_THRESHOLD = 82
const SWIPE_ANIMATION_MS = 230

export default function SwipeScreen({ onComplete, onExit, personalizationConsent, onPersonalizationConsentChange }) {
  const [cards, setCards] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [responses, setResponses] = useState([])
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const dragRef = useRef(null)
  const exitTimer = useRef(null)
  const exitingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setLoadError('')
    getSwipeCards({ signal: controller.signal })
      .then((loadedCards) => {
        if (!controller.signal.aborted) {
          setCards(loadedCards.slice(0, 8))
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

  useEffect(() => () => {
    if (exitTimer.current) window.clearTimeout(exitTimer.current)
  }, [])

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

  function startDrag(event) {
    if (isLoading || isExiting || exitingRef.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target.closest('button, input, textarea, a')) return
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX }
    setDragOffset(0)
    setIsDragging(true)
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* Pointer capture is optional in test and older browsers. */ }
  }

  function moveDrag(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    setDragOffset(event.clientX - dragRef.current.startX)
  }

  function finishDrag(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    const offset = event.clientX - dragRef.current.startX
    dragRef.current = null
    setIsDragging(false)
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch { /* Capture may already have been released. */ }

    if (Math.abs(offset) < SWIPE_THRESHOLD) {
      setDragOffset(0)
      return
    }

    const preference = offset > 0 ? 'like' : 'dislike'
    exitingRef.current = true
    setIsExiting(true)
    setDragOffset(offset > 0 ? Math.max(window.innerWidth, 480) : -Math.max(window.innerWidth, 480))
    exitTimer.current = window.setTimeout(() => {
      exitingRef.current = false
      setIsExiting(false)
      setDragOffset(0)
      answer(preference)
    }, SWIPE_ANIMATION_MS)
  }

  function cancelDrag(event) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsDragging(false)
    setDragOffset(0)
  }

  const rotation = Math.max(-10, Math.min(10, dragOffset / 18))
  const dragStyle = {
    '--drag-x': `${dragOffset}px`,
    '--drag-rotation': `${rotation}deg`,
    opacity: isExiting ? 0 : 1 - Math.min(Math.abs(dragOffset) / 700, .36),
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
            <button className="response-tile response-disagree" type="button" aria-label="Disagree" disabled={isExiting} onClick={() => answer('dislike')}>
              <span className="response-icon" aria-hidden="true">×</span><b>DISAGREE</b><small>Not my thing</small>
            </button>

            <article
              className={`interest-card ${isDragging ? 'is-dragging' : ''} ${isExiting ? 'is-exiting' : ''}`}
              key={card.id}
              role="group"
              aria-label={`Swipe card ${activeIndex + 1}: ${card.activity}`}
              style={dragStyle}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
            >
              <div className="answer-card-top"><span>BACKEND CARD / {card.id}</span><span className="card-symbol" aria-hidden="true">{String(activeIndex + 1).padStart(2, '0')}</span></div>
              <div className="interest-card-copy"><span className="answer-label">DOES THIS SOUND LIKE YOU?</span><h2>{card.activity}</h2><p>Choose whether this activity sounds like something you would enjoy.</p></div>
              <div className="interest-tags">{card.interest_tags.map((interest) => <span key={interest}>{interest.replaceAll('_', ' ')}</span>)}</div>
              <span className="answer-corner" aria-hidden="true" />
            </article>

            <button className="response-tile response-agree" type="button" aria-label="Agree" disabled={isExiting} onClick={() => answer('like')}>
              <span className="response-icon" aria-hidden="true">✓</span><b>AGREE</b><small>That feels like me</small>
            </button>
          </div>

          <label className="swipe-consent">
            <input
              type="checkbox"
              checked={Boolean(personalizationConsent)}
              onChange={(event) => onPersonalizationConsentChange?.(event.target.checked)}
            />
            <span>Allow AI to analyze my swipe responses to personalize my RPG experience.</span>
          </label>

          <div className="survey-footer"><span><i className="pixel-live" /> LIVE BACKEND DECK / {cards.length} CARDS</span><span>CHOOSE A SIDE OR SWIPE THE CARD <b>→</b></span></div>
              </>
            )}
        </div>
      </main>
    </section>
  )
}
