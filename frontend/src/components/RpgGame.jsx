import ExperienceLayout from './ExperienceLayout.jsx'

export default function RpgGame({ selectedCareer, onBackToExplorer }) {
  return (
    <ExperienceLayout className="rpg-route" label="Orquest RPG game">
      <article className="experience-card rpg-card">
        <span className="experience-kicker">ORQUEST / PLAYER ONE</span>
        <h1>Your journey begins.</h1>
        <p className="rpg-welcome">Welcome to the first step of your Orquest adventure.</p>
        <div className="journey-path-card">
          <span>YOUR SELECTED CAREER PATH</span>
          <strong>{selectedCareer?.title || 'No path selected yet'}</strong>
          {!selectedCareer && <small>You can choose a path from the Bubble Explorer at any time.</small>}
        </div>
        <section className="quest-placeholder">
          <div><span>QUEST LOG</span><b>01</b></div>
          <h2>First steps</h2>
          <p>Explore your career map and learn more about a path that interests you.</p>
          <small>Quest progress and rewards are not active yet.</small>
        </section>
        <button className="pixel-quiet-button experience-back-button" type="button" onClick={onBackToExplorer}>← Return to Bubble Explorer</button>
      </article>
    </ExperienceLayout>
  )
}
