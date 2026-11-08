// OrQuest's broad career fields are a friendly exploration layer over the
// backend's 20 job families. They are navigation groupings, not official BLS
// classifications and do not alter occupation records or career-goal IDs.
export const CAREER_FIELD_CATEGORIES = [
  {
    id: 'engineering-technology',
    label: 'Engineering & Technology',
    color: '#72b7b4',
    description: 'Design, build, maintain, and improve technical systems.',
    familyIds: [
      'family_01_computer_information_technology',
      'family_04_engineering',
      'family_12_architecture_surveying_construction_management',
    ],
  },
  {
    id: 'mathematics-analytics',
    label: 'Math & Analytics',
    color: '#83bd99',
    description: 'Use numbers, models, and evidence to understand complex problems.',
    familyIds: ['family_19_mathematical_science_analytics'],
  },
  {
    id: 'sciences',
    label: 'Sciences',
    color: '#79a9cc',
    description: 'Investigate the natural, physical, and social world.',
    familyIds: ['family_17_life_physical_social_sciences'],
  },
  {
    id: 'health-medicine',
    label: 'Health & Medicine',
    color: '#d18c98',
    description: 'Support health, treatment, rehabilitation, and patient care.',
    familyIds: [
      'family_02_healthcare_practitioners_nursing_medicine',
      'family_03_allied_health_therapy_health_technology',
    ],
  },
  {
    id: 'arts-humanities',
    label: 'Arts & Humanities',
    color: '#ac93d5',
    description: 'Create, communicate, design, and shape culture.',
    familyIds: ['family_10_arts_design', 'family_11_media_communication'],
  },
  {
    id: 'business-finance',
    label: 'Business & Finance',
    color: '#d0b574',
    description: 'Organize people, resources, money, and business growth.',
    familyIds: [
      'family_05_business_financial_operations',
      'family_06_management_executive_leadership',
      'family_20_sales_business_development',
    ],
  },
  {
    id: 'education-learning',
    label: 'Education & Learning',
    color: '#9a9acb',
    description: 'Teach, train, and help people develop new skills.',
    familyIds: ['family_07_education_training'],
  },
  {
    id: 'social-sciences-public-service',
    label: 'Social Sciences & Public Service',
    color: '#d49b84',
    description: 'Serve communities, protect people, and support society.',
    familyIds: [
      'family_08_legal',
      'family_09_protective_service_public_safety',
      'family_18_community_social_service',
    ],
  },
  {
    id: 'trades-transportation',
    label: 'Trades & Transportation',
    color: '#b4c68c',
    description: 'Build, repair, operate, and move the systems people rely on.',
    familyIds: [
      'family_13_construction_trades',
      'family_14_installation_maintenance_repair',
      'family_15_transportation_aviation',
    ],
  },
  {
    id: 'hospitality-tourism',
    label: 'Hospitality & Tourism',
    color: '#d39bb8',
    description: 'Create welcoming experiences through food, travel, and service.',
    familyIds: ['family_16_hospitality_culinary_tourism'],
  },
]

const OTHER_FIELD = {
  id: 'other-career-fields',
  label: 'Other Career Fields',
  color: '#a9adb0',
  description: 'Additional occupations not yet assigned to an OrQuest exploration field.',
}

export function buildCareerFieldGroups(jobFamilies = []) {
  const assignedIds = new Set(CAREER_FIELD_CATEGORIES.flatMap((category) => category.familyIds))
  const groups = CAREER_FIELD_CATEGORIES.map((category) => {
    const families = jobFamilies.filter((family) => category.familyIds.includes(family.id))
    return {
      ...category,
      families,
      familyCount: families.length,
      occupationCount: families.reduce((total, family) => total + (family.occupation_ids?.length || 0), 0),
    }
  }).filter((category) => category.families.length > 0)

  const unassignedFamilies = jobFamilies.filter((family) => !assignedIds.has(family.id))
  if (unassignedFamilies.length) {
    groups.push({
      ...OTHER_FIELD,
      families: unassignedFamilies,
      familyCount: unassignedFamilies.length,
      occupationCount: unassignedFamilies.reduce((total, family) => total + (family.occupation_ids?.length || 0), 0),
    })
  }

  return groups
}

export function careerFieldForFamily(familyId, groups = []) {
  return groups.find((category) => category.families.some((family) => family.id === familyId)) || OTHER_FIELD
}
