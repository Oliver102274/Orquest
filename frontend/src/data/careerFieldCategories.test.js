import { describe, expect, it } from 'vitest'
import { buildCareerFieldGroups, careerFieldForFamily } from './careerFieldCategories.js'

const catalogFamilies = [
  { id: 'family_01_computer_information_technology', name: 'Computer & Information Technology', occupation_ids: ['a', 'b'] },
  { id: 'family_04_engineering', name: 'Engineering', occupation_ids: ['c'] },
  { id: 'family_19_mathematical_science_analytics', name: 'Mathematical Science & Analytics', occupation_ids: ['d', 'e'] },
  { id: 'family_10_arts_design', name: 'Arts & Design', occupation_ids: ['f'] },
  { id: 'family_custom_new_family', name: 'New family', occupation_ids: ['g'] },
]

describe('career field navigation groups', () => {
  it('groups backend job families into broad, color-coded exploration fields', () => {
    const groups = buildCareerFieldGroups(catalogFamilies)
    expect(groups.find((group) => group.id === 'engineering-technology').families).toHaveLength(2)
    expect(groups.find((group) => group.id === 'engineering-technology').occupationCount).toBe(3)
    expect(groups.find((group) => group.id === 'mathematics-analytics').label).toBe('Math & Analytics')
    expect(groups.find((group) => group.id === 'arts-humanities').color).toBe('#ac93d5')
  })

  it('keeps an unexpected backend family visible in a neutral fallback group', () => {
    const groups = buildCareerFieldGroups(catalogFamilies)
    expect(groups.find((group) => group.id === 'other-career-fields').families[0].id).toBe('family_custom_new_family')
  })

  it('returns the exploration color for a family', () => {
    const groups = buildCareerFieldGroups(catalogFamilies)
    expect(careerFieldForFamily('family_04_engineering', groups).color).toBe('#72b7b4')
  })
})
