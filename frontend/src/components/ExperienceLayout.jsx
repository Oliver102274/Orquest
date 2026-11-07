export default function ExperienceLayout({ className = '', children, label }) {
  return (
    <section className={`experience-route ${className}`} aria-label={label}>
      <div className="experience-columns">
        <aside className="experience-side" aria-hidden="true" />
        <div className="experience-center">{children}</div>
        <aside className="experience-side" aria-hidden="true" />
      </div>
    </section>
  )
}
