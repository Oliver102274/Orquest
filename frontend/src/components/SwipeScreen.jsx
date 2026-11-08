import { useEffect, useMemo, useRef, useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import { getCareerDiscoveryQuestionBank } from '../services/api.js'
import {
  isFollowUpEligible,
  recordAnsweredFollowUp,
  recordDiscoveryAnswer,
  recordSkippedFollowUp,
  selectMainQuestion,
} from '../logic/careerDiscovery.js'

function toggleSelection(current, optionId) {
  if (optionId === 'undisclosed') return current.includes('undisclosed') ? [] : ['undisclosed']
  const withoutUndisclosed = current.filter((id) => id !== 'undisclosed')
  return withoutUndisclosed.includes(optionId)
    ? withoutUndisclosed.filter((id) => id !== optionId)
    : [...withoutUndisclosed, optionId]
}

const SWIPE_THRESHOLD = 82
const SWIPE_ANIMATION_MS = 230

export default function SwipeScreen({ onComplete, personalizationConsent, onPersonalizationConsentChange }) {
  const [bank, setBank] = useState(null)
  const [bankError, setBankError] = useState('')
  const [loadingBank, setLoadingBank] = useState(true)
  const [slotIndex, setSlotIndex] = useState(0)
  const [answersBySlot, setAnswersBySlot] = useState({})
  const [phase, setPhase] = useState('main')
  const [followUp, setFollowUp] = useState(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const dragRef = useRef(null)
  const exitTimer = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    getCareerDiscoveryQuestionBank({ signal: controller.signal })
      .then((nextBank) => { if (!controller.signal.aborted) setBank(nextBank) })
      .catch((loadError) => { if (!controller.signal.aborted) setBankError(loadError.message) })
      .finally(() => { if (!controller.signal.aborted) setLoadingBank(false) })
    return () => {
      controller.abort()
      if (exitTimer.current) window.clearTimeout(exitTimer.current)
    }
  }, [])

  const slot = bank?.slots[slotIndex]
  const question = useMemo(
    () => (slot ? selectMainQuestion(slot, answersBySlot) : null),
    [slot, answersBySlot],
  )

  function continueToNextSlot(nextAnswers) {
    const nextIndex = slotIndex + 1
    if (nextIndex >= bank.main_question_count) {
      setAnswersBySlot(nextAnswers)
      setPhase('submitting')
      const payload = {
        bank_version: bank.version,
        responses: bank.slots.map(({ slot_id }) => nextAnswers[slot_id].entry),
      }
      Promise.resolve(onComplete(payload))
        .then((submitError) => {
          if (submitError) { setError(submitError); setPhase('complete') }
        })
        .catch((submitError) => {
          setError(submitError.message || 'Bubble matching could not be completed. Try again.')
          setPhase('complete')
        })
      return
    }
    setAnswersBySlot(nextAnswers)
    setSlotIndex(nextIndex)
    setDraft('')
    setError('')
    setFollowUp(null)
    setPhase('main')
  }

  function submitMainAnswer(answerValue = draft) {
    try {
      const mainAnswer = recordDiscoveryAnswer(question, answerValue)
      const entry = { slot_id: slot.slot_id, ...mainAnswer }
      const nextAnswers = { ...answersBySlot, [slot.slot_id]: { ...mainAnswer, entry } }
      if (isFollowUpEligible(question.follow_up, answerValue)) {
        setAnswersBySlot(nextAnswers)
        setFollowUp(question.follow_up)
        setDraft('')
        setError('')
        setPhase('followup')
        return
      }
      continueToNextSlot(nextAnswers)
    } catch (answerError) {
      setError(answerError.message)
    }
  }

  function submitFollowUp(value) {
    try {
      const current = answersBySlot[slot.slot_id]
      const nextAnswers = {
        ...answersBySlot,
        [slot.slot_id]: { ...current, entry: recordAnsweredFollowUp(current.entry, followUp, value) },
      }
      continueToNextSlot(nextAnswers)
    } catch (answerError) {
      setError(answerError.message)
    }
  }

  function skipFollowUp() {
    const current = answersBySlot[slot.slot_id]
    const nextAnswers = {
      ...answersBySlot,
      [slot.slot_id]: { ...current, entry: recordSkippedFollowUp(current.entry, followUp.question_id) },
    }
    continueToNextSlot(nextAnswers)
  }

  function renderAnswerControl(activeQuestion) {
    if (activeQuestion.answer_type === 'agree_disagree') {
      const rotation = Math.max(-10, Math.min(10, dragOffset / 18))
      return (
        <div className="swipe-board discovery-swipe-board">
          <button className="response-tile response-disagree" type="button" aria-label="Disagree" disabled={isExiting} onClick={() => submitMainAnswer('disagree')}>
            <span className="response-icon" aria-hidden="true">×</span><b>DISAGREE</b><small>Not my thing</small>
          </button>
          <article
            className={`interest-card ${isDragging ? 'is-dragging' : ''} ${isExiting ? 'is-exiting' : ''}`}
            role="group"
            aria-label={activeQuestion.prompt}
            style={{ '--drag-x': `${dragOffset}px`, '--drag-rotation': `${rotation}deg`, opacity: isExiting ? 0 : 1 - Math.min(Math.abs(dragOffset) / 700, .36) }}
            onPointerDown={(event) => {
              if (event.target.closest('button')) return
              if (event.pointerType === 'mouse' && event.button !== 0) return
              dragRef.current = { pointerId: event.pointerId, startX: event.clientX }
              setIsDragging(true)
            }}
            onPointerMove={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) setDragOffset(event.clientX - dragRef.current.startX)
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) return
              const offset = event.clientX - dragRef.current.startX
              dragRef.current = null
              setIsDragging(false)
              if (Math.abs(offset) < SWIPE_THRESHOLD) { setDragOffset(0); return }
              const value = offset > 0 ? 'agree' : 'disagree'
              setIsExiting(true)
              setDragOffset(offset > 0 ? Math.max(window.innerWidth, 480) : -Math.max(window.innerWidth, 480))
              exitTimer.current = window.setTimeout(() => {
                setIsExiting(false)
                setDragOffset(0)
                submitMainAnswer(value)
              }, SWIPE_ANIMATION_MS)
            }}
            onPointerCancel={() => { dragRef.current = null; setIsDragging(false); setDragOffset(0) }}
          >
            <div className="answer-card-top"><span>CAREER DISCOVERY / {activeQuestion.question_id}</span><span className="card-symbol" aria-hidden="true">{String(slotIndex + 1).padStart(2, '0')}</span></div>
            <div className="interest-card-copy"><span className="answer-label">DOES THIS FEEL LIKE YOU?</span><h2>{activeQuestion.prompt}</h2><p>Choose a side or swipe the card.</p></div>
            <button className="discovery-undisclosed" type="button" onClick={() => submitMainAnswer('undisclosed')}>PREFER NOT TO SAY</button>
            <span className="answer-corner" aria-hidden="true" />
          </article>
          <button className="response-tile response-agree" type="button" aria-label="Agree" disabled={isExiting} onClick={() => submitMainAnswer('agree')}>
            <span className="response-icon" aria-hidden="true">✓</span><b>AGREE</b><small>That feels like me</small>
          </button>
        </div>
      )
    }
    if (activeQuestion.answer_type === 'short_text') {
      return (
        <label className="discovery-text-answer">
          <span className="sr-only">{activeQuestion.prompt}</span>
          <textarea
            maxLength={activeQuestion.max_length}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type your answer"
            rows={3}
          />
          <small>{draft.length} / {activeQuestion.max_length}</small>
        </label>
      )
    }

    const selectedIds = Array.isArray(draft) ? draft : [draft]
    return (
      <div className="discovery-options" role={activeQuestion.answer_type === 'multi_choice' ? 'group' : 'radiogroup'} aria-label={activeQuestion.prompt}>
        {activeQuestion.options.map((option) => {
          const selected = selectedIds.includes(option.id)
          const inputType = activeQuestion.answer_type === 'multi_choice' ? 'checkbox' : 'radio'
          return (
            <label className={`discovery-option ${selected ? 'is-selected' : ''}`} key={option.id}>
              <input
                type={inputType}
                name={activeQuestion.question_id}
                checked={selected}
                disabled={inputType === 'checkbox' && !selected && selectedIds.filter(Boolean).length >= (activeQuestion.max_selections || Infinity)}
                onChange={() => {
                  setError('')
                  setDraft(activeQuestion.answer_type === 'multi_choice'
                    ? toggleSelection(Array.isArray(draft) ? draft : [], option.id)
                    : option.id)
                }}
              />
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <section className="swipe-screen">
      <div className="swipe-orbs" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      <header className="game-header">
        <OrquestLogo compact />
        <div className="game-level"><span>CAREER DISCOVERY</span><b>8 QUESTION QUEST</b></div>
        <span className="session-note">NEW SESSION ON RELOAD</span>
      </header>
      <main className="swipe-playfield">
        <section className="pixel-survey-frame discovery-frame" aria-labelledby="discovery-question-title">
          {loadingBank ? (
            <div className="swipe-data-state" role="status"><strong>LOADING CAREER DISCOVERY…</strong></div>
          ) : bankError ? (
            <div className="swipe-data-state" role="alert"><strong>CAREER DISCOVERY COULD NOT LOAD</strong><p>{bankError}</p><p>Reload this page to begin a new session.</p></div>
          ) : phase === 'complete' ? (
            <div className="swipe-data-state discovery-complete" role="status">
              <span className="pixel-kicker">CAREER DISCOVERY / BUBBLE MAP</span>
              <h1 id="discovery-question-title">BUBBLE MATCHING NEEDS A RETRY</h1>
              <p>{error}</p>
              <button className="pixel-button" type="button" onClick={() => {
                setError('')
                setPhase('submitting')
                const payload = { bank_version: bank.version, responses: bank.slots.map(({ slot_id }) => answersBySlot[slot_id].entry) }
                Promise.resolve(onComplete(payload)).then((submitError) => {
                  if (submitError) { setError(submitError); setPhase('complete') }
                }).catch((submitError) => { setError(submitError.message || 'Bubble matching could not be completed.'); setPhase('complete') })
              }}>RETRY BUBBLE MATCHING</button>
            </div>
          ) : phase === 'submitting' ? (
            <div className="swipe-data-state" role="status"><strong>BUILDING YOUR BUBBLE MAP…</strong><p>Your eight answers are being matched against the current career catalog.</p></div>
          ) : (
            <>
              <div className="question-panel discovery-heading">
                <div>
                  <span className="pixel-kicker">MAIN QUESTION {slotIndex + 1} OF {bank.main_question_count}{phase === 'followup' ? ' / OPTIONAL FOLLOW-UP' : ''}</span>
                  <h1 id="discovery-question-title">{phase === 'followup' ? followUp.prompt : question.prompt}</h1>
                </div>
                <span className="question-mark" aria-hidden="true">?</span>
              </div>
              <div className="discovery-question-body">
                {renderAnswerControl(phase === 'followup' ? followUp : question)}
                {error && <p className="form-error discovery-error" role="alert">{error}</p>}
                {phase !== 'main' || question.answer_type !== 'agree_disagree' ? <div className="discovery-actions">
                  {phase === 'followup' ? (
                    <>
                      <button className="pixel-quiet-button" type="button" onClick={skipFollowUp}>SKIP THIS FOLLOW-UP</button>
                      <button className="pixel-button" type="button" onClick={() => submitFollowUp(draft)}>SAVE FOLLOW-UP</button>
                    </>
                  ) : (
                    <button className="pixel-button" type="button" onClick={() => submitMainAnswer()}>CONTINUE <span aria-hidden="true">→</span></button>
                  )}
                </div> : <div className="survey-footer discovery-swipe-hint"><span>CHOOSE A SIDE OR SWIPE THE CARD <b>→</b></span></div>}
              </div>
              {phase === 'main' && personalizationConsent !== undefined && <label className="swipe-consent">
                <input type="checkbox" checked={Boolean(personalizationConsent)} onChange={(event) => onPersonalizationConsentChange?.(event.target.checked)} />
                <span>Allow AI to analyze my responses to personalize my RPG experience.</span>
              </label>}
              <div className="survey-footer"><span><i className="pixel-live" /> QUESTION BANK V{bank.version}</span><span>FOLLOW-UPS DO NOT CHANGE MAIN PROGRESS</span></div>
            </>
          )}
        </section>
      </main>
    </section>
  )
}
