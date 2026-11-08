import { useEffect, useRef } from 'react'
import './CareerChatOverlay.css'

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
  includePreviousMessages = false,
  onIncludePreviousMessagesChange,
}) {
  const draftInput = useRef(null)
  const composeForm = useRef(null)

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

  function submitQuestion(event) {
    event?.preventDefault()
    const trimmed = draft.trim()
    if (!trimmed || loading || !canSend) return
    onSend?.(trimmed)
  }

  function handleComposerKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229) return
    event.preventDefault()
    composeForm.current?.requestSubmit()
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
          {chatEntries.map((entry, index) => (
            <article className="career-chat-exchange" key={`${entry.career_id}-${index}`}>
              <div className="career-chat-user-message"><span>YOUR QUESTION</span><p>{entry.question}</p></div>
              <div className="career-chat-answer">
                <span className={`career-chat-status status-${entry.metadata?.status || 'blocked'}`}>
                  {entry.metadata?.status === 'ai_generated' ? `AI-GENERATED DRAFT${entry.metadata.review_required ? ' / REVIEW REQUIRED' : ''}`
                    : entry.metadata?.status === 'deterministic' ? 'CATALOG GUIDANCE'
                      : 'UNAVAILABLE'}
                </span>
                {entry.metadata?.status === 'blocked' ? (
                  <p role="status">A response is unavailable for this question.</p>
                ) : (
                  <>
                    <p>{entry.answer}</p>
                    {entry.source_urls?.length > 0 && (
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
        </div>

        <div className="career-chat-personalization">
          <label className="career-chat-consent">
            <input
              type="checkbox"
              checked={Boolean(personalizationConsent)}
              onChange={(event) => onPersonalizationConsentChange?.(event.target.checked)}
            />
            <span>Allow my career chat messages to be used for RPG personalization.</span>
          </label>
          {personalizationConsent && chatEntries.length > 0 && (
            <label className="career-chat-history-consent">
              <input
                type="checkbox"
                checked={Boolean(includePreviousMessages)}
                onChange={(event) => onIncludePreviousMessagesChange?.(event.target.checked)}
              />
              <span>Also include messages from earlier in this conversation.</span>
            </label>
          )}
          {personalizationConsent && (
            <p className="career-chat-consent-note">Your permission is recorded. The current backend does not yet accept conversation history for RPG personalization, so chat content is not transferred to RPG progress.</p>
          )}
        </div>

        <form ref={composeForm} className="career-chat-compose" onSubmit={submitQuestion}>
          <textarea
            ref={draftInput}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            aria-label="Career chat question draft"
            placeholder="Ask about this career..."
            rows={2}
          />
          <button type="submit" disabled={!canSend || !draft.trim() || loading} aria-label="Send question">{loading ? 'Sending…' : 'Send'}</button>
        </form>
      </section>
    </div>
  )
}
