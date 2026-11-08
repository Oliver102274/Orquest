export default function SavedCareerPaths({ careerPaths = [], activeCareerId, onSelectCareerPath }) {
  if (careerPaths.length < 2) return null

  return (
    <section className="saved-career-paths" aria-labelledby="saved-career-paths-title">
      <div>
        <h2 id="saved-career-paths-title">Saved career paths</h2>
        <p>Choose one path as the active RPG target. Other saved paths stay available.</p>
      </div>
      <div className="saved-career-path-list">
        {careerPaths.map((career) => {
          const isActive = career.career_id === activeCareerId
          return (
            <button
              key={career.career_id}
              className={`saved-career-path ${isActive ? 'is-active' : ''}`}
              type="button"
              aria-pressed={isActive}
              disabled={isActive}
              onClick={() => onSelectCareerPath?.(career)}
            >
              <span>{career.title}</span>
              <small>{isActive ? 'ACTIVE RPG TARGET' : 'SET ACTIVE TARGET'}</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}
