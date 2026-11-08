import { useRef, useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import { parseSaveFile, saveFileSummary } from '../logic/saveFile.js'

export default function LoginScreen({ onLogin, onImportSave }) {
  const [importError, setImportError] = useState('')
  const [pendingImport, setPendingImport] = useState(null)
  const saveInput = useRef(null)

  function handleSubmit(event) {
    event.preventDefault()

    onLogin()
  }

  async function handleSaveFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setPendingImport(null)
    setImportError('')
    try {
      const parsed = parseSaveFile(await file.text())
      setPendingImport(parsed)
    } catch (fileError) {
      setImportError(fileError.message || 'The save file could not be read.')
    } finally {
      event.target.value = ''
    }
  }

  function confirmImport() {
    if (!pendingImport) return
    onImportSave(pendingImport)
    setPendingImport(null)
  }

  const importSummary = pendingImport ? saveFileSummary(pendingImport) : null

  return (
    <section className="login-scene">
      <div className="concert-hall" aria-hidden="true">
        <div className="hall-ceiling" />
        <div className="hall-balcony balcony-back" />
        <div className="hall-balcony balcony-front" />
        <div className="hall-seat-row seat-row-one" />
        <div className="hall-seat-row seat-row-two" />
        <div className="hall-floor" />
        <div className="conductor-shadow"><span /></div>
      </div>

      <div className="login-stage">
        <div className="login-logo"><OrquestLogo /></div>
        <div className="pixel-login-card">
          <div className="pixel-card-ribbon"><span>PUBLIC DEMO</span><span className="ribbon-light" /></div>
          <p className="pixel-kicker">DEMO BUILD / 001</p>
          <h1>Take your place.</h1>
          <p className="login-intro">Your next path starts with one small choice. No account or password is needed. Please do not enter personal or sensitive information.</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate autoComplete="off">
            <button className="pixel-button login-submit" type="submit">
              <span>Start Fresh / Enter the hall</span><span aria-hidden="true">▶</span>
            </button>
          </form>

          <div className="login-save-controls">
            <input
              ref={saveInput}
              className="save-file-input"
              type="file"
              accept="application/json,.json"
              aria-label="Choose saved progress JSON file"
              onChange={handleSaveFileChange}
            />
            <button className="login-import-button" type="button" onClick={() => saveInput.current?.click()}>
              IMPORT SAVED PROGRESS
            </button>
            <p className="login-save-note">Start Fresh is the default. Save files hold supported progress only; credentials and chat history are never included. Nothing is synced to an account.</p>
            {importError && <p className="form-error" role="alert">{importError}</p>}
            {pendingImport && importSummary && (
              <section className="save-import-preview" aria-labelledby="save-import-title">
                <strong id="save-import-title">Saved progress ready to import</strong>
                <ul>
                  <li>{importSummary.swipeCount} swipe responses</li>
                  <li>{importSummary.careerPathCount} saved career paths</li>
                  <li>Active path: {importSummary.activeCareerTitle || 'none'}</li>
                  <li>{importSummary.questionnaireConsent
                    ? `${importSummary.questionnaireAnswerCount} non-empty questionnaire answers saved with consent`
                    : 'No questionnaire answers included'}</li>
                </ul>
                <p>Confirm to replace the current demo session with this save.</p>
                <div className="save-import-actions">
                  <button className="pixel-button" type="button" onClick={confirmImport}>CONFIRM IMPORT</button>
                  <button className="pixel-quiet-button" type="button" onClick={() => setPendingImport(null)}>CANCEL</button>
                </div>
              </section>
            )}
          </div>

          <div className="demo-credentials">
            <span className="demo-badge">DEMO</span>
            <span>Guest access · Temporary missions and XP</span>
          </div>
        </div>
        <p className="login-footnote">PUBLIC DEMO <span>·</span> NO ACCOUNT SYNC</p>
      </div>
    </section>
  )
}
