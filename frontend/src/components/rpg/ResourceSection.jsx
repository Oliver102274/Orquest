export default function ResourceSection({ title, resources }) {
  if (!resources.length) return null
  return (
    <section className="roadmap-section">
      <h3>{title}</h3>
      <ul>
        {resources.map((resource) => (
          <li key={resource.id}>
            <strong>{resource.title}</strong>
            <small>{resource.organization} · {resource.type} · {resource.verification_status}</small>
            {resource.source_url && <a href={resource.source_url} target="_blank" rel="noreferrer">Open source</a>}
          </li>
        ))}
      </ul>
    </section>
  )
}