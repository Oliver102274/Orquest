import { useEffect, useRef } from 'react'

export default function CareerChatOverlay({
  hasOpened,
  expanded,
  draft,
  onDraftChange,
  onToggle,
  careerTitle,
  personalizationConsent,
  onPersonalizationConsentChange,
}) {
  const draftInput = useRef(null)

  useEffect(() => {
    if (expanded) draftInput.current?.focus()
  }, [expanded])

  if (!hasOpened) return null

  if (!expanded) {
    return (
      <button className="career-chat-dock" type="button" onClick={onToggle} aria-label="Expand career chat" aria-expanded="false">
        <span>CAREER CHAT</span><b className="career-chat-arrow" aria-hidden="true">⌄</b>
      </button>
    )
  }

  return (
    <div className="career-chat-backdrop">
      <section className="career-chat-panel" role="dialog" aria-modal="true" aria-labelledby="career-chat-title">
        <header className="career-chat-header">
          <div>
            <span>ORQUEST / CAREER CONVERSATION</span>
            <h2 id="career-chat-title">Ask about {careerTitle}</h2>
          </div>
          <button type="button" className="career-chat-toggle" onClick={onToggle} aria-label="Collapse career chat" aria-expanded="true">
            <b className="career-chat-arrow is-expanded" aria-hidden="true">⌄</b>
          </button>
        </header>

        <div className="career-chat-history">
          <div className="career-chat-connection" role="status">
            <strong>Career AI chat is not connected yet.</strong>
            <p>The backend has no career question-answering endpoint. Questions are not sent, and no AI responses are generated.</p>
          </div>
          {draft && (
            <div className="career-chat-unsent-draft">
              <span>UNSENT QUESTION DRAFT</span>
              <p>{draft}</p>
            </div>
          )}
        </div>

        <label className="career-chat-consent">
          <input
            type="checkbox"
            checked={Boolean(personalizationConsent)}
            onChange={(event) => onPersonalizationConsentChange?.(event.target.checked)}
          />
          <span>Allow AI to analyze my career chat conversations to personalize my RPG experience.</span>
        </label>

        <div className="career-chat-compose">
          <textarea
            ref={draftInput}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            aria-label="Career chat question draft"
            placeholder="Career AI chat is not connected..."
            rows={2}
          />
          <button type="button" disabled aria-label="Send question unavailable">Send</button>
        </div>
        <p className="career-chat-local-note">Your draft stays in this screen. It will not be sent until the backend supports career chat.</p>
      </section>
    </div>
  )
}
