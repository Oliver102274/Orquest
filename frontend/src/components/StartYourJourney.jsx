import ExperienceLayout from './ExperienceLayout.jsx'

export default function StartYourJourney({ selectedCareer, onStart, onBackToExplorer }) {
  return (
    <ExperienceLayout className="journey-route" label="Start your journey">
      <article className="experience-card journey-card">
        <span className="experience-kicker">ORQUEST / YOUR NEXT CHAPTER</span>
        <h1>Ready when you are.</h1>
        <p className="journey-intro">Your map is still here. When you're ready, step into your journey.</p>
        <div className="journey-path-card">
          <span>SELECTED CAREER PATH</span>
          <strong>{selectedCareer?.title || 'No career selected yet'}</strong>
          {!selectedCareer && <small>Choose a career bubble on the map whenever you like.</small>}
        </div>
        <button className="journey-start-button" type="button" onClick={onStart}>
          <span>BEGIN YOUR ADVENTURE</span>
          <strong>Start Your Journey</strong>
          <i aria-hidden="true">▶</i>
        </button>
        <button className="experience-back-button" type="button" onClick={onBackToExplorer}>← Return to Bubble Explorer</button>
      </article>
    </ExperienceLayout>
  )
}
