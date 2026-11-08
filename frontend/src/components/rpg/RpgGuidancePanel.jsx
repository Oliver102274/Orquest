import EducationalResources from './EducationalResources.jsx'
import { resolveOccupationId } from '../../data/careerOccupationMap.js'
import ResourceSection from './ResourceSection.jsx'

// Roadmap guidance. In `preview` mode the roadmap is an unstarted suggestion set;
// in `active` mode it comes from a live progress session, where the mission board
// owns the suggested steps and no XP figure is shown inside this panel.
export default function RpgGuidancePanel({ roadmap, active = false }) {
  const blocked = roadmap.metadata.status === 'blocked'
  const missionSuggestions = roadmap.suggested_missions
  const sourceUrls = [...new Set(roadmap.source_urls)]

  return (
    <section className="roadmap-panel" aria-labelledby="roadmap-result-title">
      <span className={`roadmap-status status-${roadmap.metadata.status}`}>
        {roadmap.metadata.status === 'ai_generated' ? `AI-GENERATED DRAFT${roadmap.metadata.review_required ? ' / REVIEW REQUIRED' : ''}`
          : roadmap.metadata.status === 'deterministic' ? 'DETERMINISTIC CATALOG GUIDANCE'
            : 'ROADMAP UNAVAILABLE'}
      </span>
      <h2 id="roadmap-result-title">{active ? 'Guidance for' : 'Roadmap for'} {roadmap.target_occupation.title}</h2>
      {blocked ? (
        <p className="roadmap-error" role="status">The backend could not safely provide roadmap suggestions. No suggested steps are shown.</p>
      ) : (
        <>
          {!active && <p className="roadmap-review-note">These are roadmap suggestions, not active RPG missions. No progress or rewards are recorded.</p>}

          {roadmap.relevant_skills_and_qualifications.length > 0 && (
            <section className="roadmap-section">
              <h3>Relevant skills and qualifications</h3>
              <ul>{roadmap.relevant_skills_and_qualifications.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            </section>
          )}

          <ResourceSection title="MDC pathways to investigate" resources={roadmap.mdc_pathways} />
          <ResourceSection title="Alternative resources to investigate" resources={roadmap.alternative_resources} />
          <EducationalResources careerId={roadmap.target_occupation.career_id}
            occupationId={resolveOccupationId(roadmap.target_occupation.career_id)}
            displayedResources={[...roadmap.mdc_pathways, ...roadmap.alternative_resources]} />

          {!active && missionSuggestions.length > 0 && (
            <section className="roadmap-section">
              <h3>Suggested roadmap steps</h3>
              <ul>
                {missionSuggestions.map((step) => (
                  <li key={step.id}>
                    <strong>{step.title}</strong>
                    <p>{step.instruction}</p>
                    {step.resource_ids.length > 0 && <small>Related resource IDs: {step.resource_ids.join(', ')}</small>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {roadmap.evidence_gaps.length > 0 && (
            <section className="roadmap-section">
              <h3>Evidence gaps</h3>
              <ul>{roadmap.evidence_gaps.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}</ul>
            </section>
          )}

          {sourceUrls.length > 0 && (
            <section className="roadmap-section">
              <h3>Sources</h3>
              <ul>{sourceUrls.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul>
            </section>
          )}
        </>
      )}
    </section>
  )
}