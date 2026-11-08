import { resolveMissionResources } from '../../logic/rpgProgress.js'

export default function RpgMissionCard({ mission, roadmap, saving, onComplete }) {
  const resources = resolveMissionResources(mission, roadmap)

  return (
    <article className={`rpg-mission-info ${mission.completed ? 'is-complete' : ''}`}>
      <section className="detail-section">
        <h3>Mission instructions</h3>
        <p className="rpg-mission-instruction">{mission.instruction}</p>
      </section>

      <section className="detail-section">
        <h3>Mission progress</h3>
        <dl className="rpg-mission-facts">
          <div><dt>XP reward</dt><dd>+{mission.xp_reward} XP</dd></div>
          <div><dt>Status</dt><dd>{mission.completed ? 'Complete' : 'Not complete'}</dd></div>
          <div><dt>Completion</dt><dd>Self-reported</dd></div>
        </dl>
        <p className="rpg-detail-contract-note">
          Complete this activity in the real world, then confirm it here. The backend records the completion and awards the XP.
        </p>
      </section>

      {resources.length > 0 && (
        <section className="detail-section rpg-mission-resources" aria-label="Mission resources">
          <h3>Resources</h3>
          <ul>
            {resources.map((resource) => (
              <li key={resource.id}>
                <strong>{resource.title}</strong>
                <small>{resource.organization} · {resource.type}</small>
                {resource.source_url && <a href={resource.source_url} target="_blank" rel="noreferrer">Open source</a>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        className="pixel-button rpg-detail-complete"
        type="button"
        disabled={mission.completed || saving}
        onClick={() => onComplete(mission)}
      >
        {mission.completed ? 'MISSION COMPLETE' : saving ? 'RECORDING…' : `COMPLETE MISSION · +${mission.xp_reward} XP`}
      </button>
    </article>
  )
}
