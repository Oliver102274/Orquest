import { summarizeProgress } from '../../logic/rpgProgress.js'

export default function RpgProgressHeader({ progress, syncing, onRefresh }) {
  const summary = summarizeProgress(progress)
  const pathStatus = summary.allComplete ? 'COMPLETE' : summary.total ? 'ACTIVE' : 'EMPTY'
  const statusDescription = summary.allComplete
    ? 'All supplied missions completed'
    : `${summary.remaining} mission${summary.remaining === 1 ? '' : 's'} remaining`

  return (
    <section className="rpg-progression-hud" aria-label="Mission path progress">
      <div className="rpg-level-readout">
        <span className="rpg-hud-kicker">PATH STATUS</span>
        <strong>{pathStatus}</strong>
        <small>{statusDescription}</small>
      </div>
      <div className="rpg-path-xp" aria-label={`${summary.totalXp} XP earned in this path`}>
        <span className="rpg-hud-kicker">PATH XP</span>
        <strong>{summary.totalXp}</strong>
        <small>BACKEND AWARDED</small>
      </div>
      <div className="rpg-mission-progress-hud">
        <div className="rpg-mission-progress-copy">
          <span className="rpg-hud-kicker">MISSIONS COMPLETE</span>
          <strong>{summary.completed} / {summary.total}</strong>
        </div>
        <div
          className="rpg-mission-completion-bar"
          role="progressbar"
          aria-label="Completed missions in this path"
          aria-valuemin={0}
          aria-valuemax={Math.max(summary.total, 1)}
          aria-valuenow={summary.completed}
        >
          <span style={{ width: `${summary.percent}%` }} />
        </div>
        <small className="rpg-hud-session-notice" title={progress?.notice || ''}>
          {progress?.notice || 'Mission progress is temporarily stored by the backend.'}
        </small>
      </div>
      <button className="rpg-hud-button rpg-refresh-button" type="button" disabled={syncing} onClick={onRefresh}>
        {syncing ? 'SYNCING…' : 'SYNC'}
      </button>
    </section>
  )
}
