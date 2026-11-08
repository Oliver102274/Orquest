import { useEffect, useState } from 'react'
import { getCareer, getOccupationResources } from '../../services/api.js'
import ResourceSection from './ResourceSection.jsx'

export default function EducationalResources({ occupationId, careerId, displayedResources = [] }) {
  const [resources, setResources] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isOccupation = occupationId?.startsWith('occupation_') ?? false
  const isDataAnalyst = careerId === 'career_data_analyst' && !isOccupation

  useEffect(() => {
    if (!isOccupation && !isDataAnalyst) {
      setResources(null)
      setLoading(false)
      setError('')
      return
    }

    const controller = new AbortController()
    setResources(null)
    setLoading(true)
    setError('')

    const request = isOccupation
      ? getOccupationResources(occupationId, { signal: controller.signal })
      : getCareer(careerId, { signal: controller.signal })

    request
      .then(data => {
        if (!controller.signal.aborted) setResources(data)
      })
      .catch(err => {
        if (!controller.signal.aborted) setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [occupationId, careerId, isOccupation, isDataAnalyst])

  const displayedIds = new Set(displayedResources.map(item => item.id))
  const displayedUrls = new Set(displayedResources.map(item => item.source_url).filter(Boolean))
  const additional = items => items.filter(item => !displayedIds.has(item.id) && !displayedUrls.has(item.source_url))
  if (!isOccupation && !isDataAnalyst) return null

  return (
    <section className="roadmap-panel" aria-label="Educational resources">
      <h2>Educational Resources</h2>

      <p>
        {isDataAnalyst
          ? 'Explore learning resources associated with Data Analyst. Verification status does not guarantee admission, qualifications, or employment.'
          : 'Explore possible training pathways for your selected occupation. Discovered programs are not verified qualifications.'}
      </p>

      {loading && <p role="status">Finding educational resources...</p>}
      {error && <p className="roadmap-error" role="alert">{error}</p>}

      {isDataAnalyst && resources && (
        <>
          <ResourceSection
            title="Miami Dade College Programs"
            resources={additional(resources.mdc_resources)}
          />
          <ResourceSection
            title="Additional Learning Resources"
            resources={additional(resources.external_resources)}
          />
        </>
      )}

      {isOccupation && resources && (
        <>
          <section className="roadmap-section">
            <h3>MDC Programs — SOC Matches</h3>
            {additional(resources.resources).length ? (
              <ul>
                {additional(resources.resources).map(item => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.organization} — Unverified candidate</p>
                    {item.source_url && (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                        View official catalog
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p>No additional exact MDC matches found.</p>}
          </section>

          <section className="roadmap-section">
            <h3>Related MDC Programs</h3>
            {additional(resources.related_resources).length ? (
              <ul>
                {additional(resources.related_resources).map(item => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <p>Potential match — not individually verified</p>
                    {item.source_url && (
                      <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                        View MDC catalog
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p>No additional related MDC candidates found.</p>}
          </section>

          <section className="roadmap-section">
            <h3>Explore Additional Training</h3>
            <ul>
              {resources.external_search_options.map(item => (
                <li key={item.url}>
                  <strong>{item.title}</strong>
                  <p>Search for: {item.search_term}</p>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    Open training directory
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  )
}

