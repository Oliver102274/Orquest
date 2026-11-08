// Explicitly reviewed mappings between legacy careers and SOC occupations.
// Do not infer occupational equivalence from similar titles.

export const CAREER_OCCUPATION_MAP = {
  career_software_developer: 'occupation_15_1252',
  career_cybersecurity_analyst: 'occupation_15_1212',
}

export function resolveOccupationId(careerId) {
  if (!careerId) return null

  if (careerId.startsWith('occupation_')) {
    return careerId
  }

  return CAREER_OCCUPATION_MAP[careerId] ?? null
}
