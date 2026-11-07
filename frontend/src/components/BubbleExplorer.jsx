import { useMemo, useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import { bubbleCategories } from '../data/demoData.js'

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  )
}

function toMapPoint(position) {
  return { x: position.x * 10, y: position.y * 6.5 }
}

export default function BubbleExplorer({ responses, onExit }) {
  const [enabledCategories, setEnabledCategories] = useState(() => new Set(bubbleCategories.map((category) => category.id)))
  const [query, setQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState({
    id: bubbleCategories[0].id,
    label: bubbleCategories[0].label,
    categoryId: bubbleCategories[0].id,
    kind: 'category',
  })

  const normalizedQuery = query.trim().toLowerCase()
  const selectedCategory = bubbleCategories.find((category) => category.id === selectedNode.categoryId)
  const matchedFamilies = useMemo(() => {
    if (!normalizedQuery) return new Set(bubbleCategories.map((category) => category.id))
    return new Set(bubbleCategories
      .filter((category) => category.label.toLowerCase().includes(normalizedQuery)
        || category.children.some((child) => child.label.toLowerCase().includes(normalizedQuery)))
      .map((category) => category.id))
  }, [normalizedQuery])
  const agreedCount = responses.filter((response) => response.preference === 'like').length

  function toggleCategory(categoryId) {
    setEnabledCategories((current) => {
      const next = new Set(current)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  function selectNode(node, category, kind) {
    setSelectedNode({ id: node.id, label: node.label, categoryId: category.id, kind })
  }

  function familyIsVisible(category) {
    return enabledCategories.has(category.id) && matchedFamilies.has(category.id)
  }

  const scopePairs = [
    ['math', 'sciences'],
    ['sciences', 'technology'],
    ['social-science', 'health'],
    ['arts-humanities', 'technology'],
    ['business', 'math'],
    ['education', 'social-science'],
  ]

  return (
    <section className="bubble-screen">
      <header className="map-header">
        <OrquestLogo compact />
        <div className="map-header-title"><span>ORQUEST / FIELD MAP</span><h1>Bubble Explorer</h1></div>
        <div className="map-header-status"><i /> PROTOTYPE / {agreedCount} AGREED SIGNALS</div>
        <button className="pixel-quiet-button" type="button" onClick={onExit}>RESTART <span aria-hidden="true">↻</span></button>
      </header>

      <main className="map-frame">
        <div className="map-filterbar">
          <div className="filter-title"><span>FAMILY FILTERS</span><small>CLICK TO MUTE / LIGHT</small></div>
          <div className="map-filter-list" aria-label="Career category filters">
            {bubbleCategories.map((category) => {
              const enabled = enabledCategories.has(category.id)
              return (
                <button
                  key={category.id}
                  className={`map-filter ${enabled ? '' : 'is-muted'}`}
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  aria-label={`Toggle ${category.label}`}
                  aria-pressed={enabled}
                  style={{ '--bubble-color': category.color }}
                >
                  <i />{category.label}
                </button>
              )
            })}
          </div>
          <span className="filter-count">{enabledCategories.size.toString().padStart(2, '0')} / {bubbleCategories.length.toString().padStart(2, '0')}</span>
        </div>

        <div className="map-canvas">
          <svg className="map-links" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
            {bubbleCategories.map((category) => {
              const root = toMapPoint(category.position)
              const centerEnabled = enabledCategories.has(category.id)
              return (
                <g key={category.id} style={{ '--bubble-color': category.color }} className={centerEnabled && matchedFamilies.has(category.id) ? '' : 'link-muted'}>
                  <line className="map-edge center-edge" x1="500" y1="325" x2={root.x} y2={root.y} />
                  {category.children.map((child) => {
                    const point = toMapPoint(child.position)
                    return <line key={child.id} className="map-edge branch-edge" x1={root.x} y1={root.y} x2={point.x} y2={point.y} />
                  })}
                </g>
              )
            })}
            {scopePairs.map(([fromId, toId]) => {
              const from = bubbleCategories.find((category) => category.id === fromId)
              const to = bubbleCategories.find((category) => category.id === toId)
              const start = toMapPoint(from.position)
              const end = toMapPoint(to.position)
              const visible = enabledCategories.has(fromId) && enabledCategories.has(toId)
              return <line key={`${fromId}-${toId}`} className={`map-edge scope-edge ${visible ? '' : 'link-muted'}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} style={{ '--bubble-color': from.color }} />
            })}
          </svg>

          {bubbleCategories.map((category) => {
            const familyVisible = familyIsVisible(category)
            const familySelected = selectedNode.categoryId === category.id
            const familyMatch = matchedFamilies.has(category.id)
            const categoryAccessibleName = `${category.label} category bubble`
            return (
              <div key={category.id} className="bubble-family" style={{ '--bubble-color': category.color }}>
                <button
                  className={`map-bubble category-bubble ${familyVisible ? '' : 'is-muted'} ${normalizedQuery && familyMatch ? 'is-search-match' : ''} ${normalizedQuery && !familyMatch ? 'is-search-dim' : ''} ${familySelected && selectedNode.id === category.id ? 'is-selected' : ''}`}
                  type="button"
                  style={{ left: `${category.position.x}%`, top: `${category.position.y}%` }}
                  onClick={() => selectNode(category, category, 'category')}
                  aria-label={categoryAccessibleName}
                  aria-pressed={familySelected && selectedNode.id === category.id}
                >
                  <span className="bubble-glint" aria-hidden="true" />
                  <span className="category-bubble-name">{category.label}</span>
                  <span className="category-bubble-count">{category.children.length} PATHS</span>
                </button>
                {category.children.map((child) => (
                  <button
                    key={child.id}
                    className={`map-bubble sub-bubble ${familyVisible ? '' : 'is-muted'} ${normalizedQuery && familyMatch ? 'is-search-match' : ''} ${normalizedQuery && !familyMatch ? 'is-search-dim' : ''} ${selectedNode.id === child.id ? 'is-selected' : ''}`}
                    type="button"
                    style={{ left: `${child.position.x}%`, top: `${child.position.y}%` }}
                    onClick={() => selectNode(child, category, 'path')}
                    aria-label={`${child.label} under ${category.label}`}
                    aria-pressed={selectedNode.id === child.id}
                  >
                    <span className="bubble-glint" aria-hidden="true" />
                    <span>{child.label}</span>
                  </button>
                ))}
              </div>
            )
          })}

          <label className="central-search-bubble" htmlFor="bubble-map-search" style={{ '--search-family-color': selectedCategory?.color ?? '#9d84e7' }}>
            <span className="search-orbit" aria-hidden="true"><SearchIcon /></span>
            <span className="search-bubble-caption">THE ORQUEST ORBIT</span>
            <input id="bubble-map-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the map" aria-label="Search bubble map" />
            <span className="search-bubble-hint">TYPE TO TRACE A PATH</span>
          </label>

          <aside className="map-guide">
            <span className="guide-title"><i>?</i> FIELD GUIDE <small>SELECTED</small></span>
            <strong className="guide-selection">{selectedNode.label}</strong>
            <span className="guide-family">{selectedCategory?.label ?? 'Map node'} / synthetic label</span>
            <p><b>Click a color</b> to mute its whole family. Choose a bubble to inspect its scope. Search highlights matching paths.</p>
            <div className="guide-footer"><span>DEMO DATA ONLY</span><span>◈ {selectedNode.kind === 'category' ? 'MAIN' : 'PATH'}</span></div>
          </aside>

          {normalizedQuery && matchedFamilies.size === 0 && <div className="map-no-match">NO MATCHING PATH / TRY A BROADER TERM</div>}
        </div>
      </main>
      <footer className="map-footer"><span>GRAY FAMILIES ARE MUTED, NOT REMOVED</span><span>ORQUEST / EXPLORATION BUILD 0.1</span></footer>
    </section>
  )
}
