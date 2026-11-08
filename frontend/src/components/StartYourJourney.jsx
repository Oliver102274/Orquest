import ExperienceLayout from './ExperienceLayout.jsx'
import SavedCareerPaths from './SavedCareerPaths.jsx'

export default function StartYourJourney({ activeTargetCareer, careerPaths, onSelectCareerPath, onExportSave, onStart, onBackToExplorer }) {
  return (
    <ExperienceLayout className="journey-route" label="Start your journey">
      <article className="experience-card journey-card">
        <span className="experience-kicker">ORQUEST / YOUR NEXT CHAPTER</span>
        <h1>Ready when you are.</h1>
        <p className="journey-intro">Your map is still here. When you're ready, step into your journey.</p>
        <div className="journey-path-card">
          <span>ACTIVE RPG TARGET</span>
          <strong>{activeTargetCareer?.title || 'No target selected yet'}</strong>
          {!activeTargetCareer && <small>Explore careers, then choose “Choose This as My Goal” to set an RPG target.</small>}
        </div>
        <SavedCareerPaths
          careerPaths={careerPaths}
          activeCareerId={activeTargetCareer?.career_id}
          onSelectCareerPath={onSelectCareerPath}
        />
        <button className="journey-start-button" type="button" onClick={onStart}>
          <span>BEGIN YOUR ADVENTURE</span>
          <strong>Start Your Journey</strong>
          <i aria-hidden="true">▶</i>
        </button>
        <div className="journey-secondary-actions">
          <button className="save-export-button" type="button" onClick={onExportSave}>EXPORT SAVED PROGRESS</button>
          <button className="experience-back-button" type="button" onClick={onBackToExplorer}>← Return to Bubble Explorer</button>
        </div>
      </article>
    </ExperienceLayout>
  )
}
