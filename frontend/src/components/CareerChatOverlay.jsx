import { useEffect, useRef } from 'react'

export default function CareerChatOverlay({
  hasOpened,
  expanded,
  draft,
  onDraftChange,
  onToggle,
  careerTitle,
  chatEntries = [],
  loading = false,
  error = '',
  canSend = false,
  onSend,
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

        <div className="career-chat-history" aria-live="polite">
          <div className="career-chat-connection" role="note">
            <strong>Questions are sent only when you press Send.</strong>
            <p>Each request includes this career and this question only. The backend does not accept conversation history.</p>
          </div>
          {chatEntries.map((entry, index) => (
            <article className="career-chat-exchange" key={`${entry.career_id}-${index}`}>
              <div className="career-chat-user-message"><span>YOUR QUESTION</span><p>{entry.question}</p></div>
              <div className="career-chat-answer">
                <span className={`career-chat-status status-${entry.metadata.status}`}>
                  {entry.metadata.status === 'ai_generated' ? `AI-GENERATED DRAFT${entry.metadata.review_required ? ' / REVIEW REQUIRED' : ''}`
                    : entry.metadata.status === 'deterministic' ? 'CATALOG GUIDANCE'
                      : 'UNAVAILABLE'}
                </span>
                {entry.metadata.status === 'blocked' ? (
                  <p role="status">A response is unavailable for this question.</p>
                ) : (
                  <>
                    <p>{entry.answer}</p>
                    {entry.source_urls.length > 0 && (
                      <ul className="career-chat-sources">
                        {entry.source_urls.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
          {loading && <p className="career-chat-loading" role="status">SENDING QUESTION…</p>}
          {error && <p className="career-chat-error" role="alert">{error} Your draft is still here; press Send to retry.</p>}
          {draft && <p className="career-chat-draft-note">Draft ready. It has not been sent.</p>}
        </div>

        <label className="career-chat-consent">
          <input
            type="checkbox"
            checked={Boolean(personalizationConsent)}
            onChange={(event) => onPersonalizationConsentChange?.(event.target.checked)}
          />
          <span>Allow AI to analyze my career chat conversations to personalize my RPG experience.</span>
        </label>

        <form className="career-chat-compose" onSubmit={(event) => { event.preventDefault(); onSend?.(draft) }}>
          <textarea
            ref={draftInput}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            aria-label="Career chat question draft"
            placeholder="Ask about this career..."
            rows={2}
          />
          <button type="submit" disabled={!canSend || !draft.trim() || loading} aria-label="Send question">{loading ? 'Sending…' : 'Send'}</button>
        </form>
        <p className="career-chat-local-note">The chat-personalization choice is separate. Current requests do not send or store chat history for RPG personalization.</p>
      </section>
    </div>
  )
}
