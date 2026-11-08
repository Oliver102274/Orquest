import { useEffect, useState } from 'react'
import { getJobCatalog } from '../services/api.js'

export default function JobCatalogPicker({ onSelect }) {
  const [catalog, setCatalog] = useState(null)
  const [family, setFamily] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    getJobCatalog({ signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setCatalog(value)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [])
  if (error) return <p role="alert">{error}</p>
  if (!catalog) return <p role="status">Loading job catalog…</p>
  return <section className="detail-section catalog-picker" aria-label="Job catalog">
    <p>{catalog.families.length} job families · {catalog.occupations.length} occupations</p>
    <p>{catalog.metadata?.salary_scope} Catalog entries are reference data, not verified career evidence.</p>
    <label>Job family <select value={family} onChange={event => setFamily(event.target.value)}>
      <option value="">All families</option>
      {catalog.families.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <label>Specific occupation <select value="" onChange={event => {
      const occupation = catalog.occupations.find(item => item.id === event.target.value)
      if (occupation) onSelect({ career_id: occupation.id, title: occupation.title, matched_interest_tags: [] })
    }}>
      <option value="" disabled>Select a job to investigate</option>
      {catalog.occupations.filter(item => !family || item.family_id === family).map(item =>
        <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>
  </section>
}
