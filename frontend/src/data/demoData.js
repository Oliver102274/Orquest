export const swipeCards = [
  {
    id: 'demo-card-01',
    title: 'Find a pattern in a messy problem',
    prompt: 'You enjoy sorting through details until a clearer picture emerges.',
    interests: ['Curiosity', 'Problem solving'],
    color: 'mint',
    icon: '✳',
  },
  {
    id: 'demo-card-02',
    title: 'Make an idea easier to understand',
    prompt: 'You like turning a complicated thought into a simple story or visual.',
    interests: ['Communication', 'Creativity'],
    color: 'peach',
    icon: '↗',
  },
  {
    id: 'demo-card-03',
    title: 'Build something useful from scratch',
    prompt: 'You get energy from trying ideas, making things, and improving them.',
    interests: ['Making', 'Experimenting'],
    color: 'lavender',
    icon: '⌘',
  },
  {
    id: 'demo-card-04',
    title: 'Help someone take a next step',
    prompt: 'You enjoy listening, sharing perspective, and finding a practical way forward.',
    interests: ['People', 'Support'],
    color: 'yellow',
    icon: '♡',
  },
]

// Synthetic map labels for the frontend prototype. They are broad exploration
// categories, not factual career recommendations or a finalized taxonomy.
export const bubbleCategories = [
  {
    id: 'math',
    label: 'Math',
    color: '#83bd99',
    position: { x: 18, y: 22 },
    children: [
      { id: 'statistics', label: 'Statistics', position: { x: 8, y: 10 } },
      { id: 'applied-math', label: 'Applied math', position: { x: 31, y: 9 } },
      { id: 'logic', label: 'Logic', position: { x: 29, y: 34 } },
    ],
  },
  {
    id: 'sciences',
    label: 'Sciences',
    color: '#79a9cc',
    position: { x: 50, y: 15 },
    children: [
      { id: 'biology', label: 'Biology', position: { x: 39, y: 5 } },
      { id: 'chemistry', label: 'Chemistry', position: { x: 62, y: 5 } },
      { id: 'earth-science', label: 'Earth science', position: { x: 40, y: 32 } },
    ],
  },
  {
    id: 'social-science',
    label: 'Social science',
    color: '#d49b84',
    position: { x: 82, y: 22 },
    children: [
      { id: 'psychology', label: 'Psychology', position: { x: 70, y: 36 } },
      { id: 'sociology', label: 'Sociology', position: { x: 92, y: 10 } },
      { id: 'public-policy', label: 'Public policy', position: { x: 92, y: 35 } },
    ],
  },
  {
    id: 'arts-humanities',
    label: 'Arts & humanities',
    color: '#ac93d5',
    position: { x: 86, y: 55 },
    children: [
      { id: 'design', label: 'Design', position: { x: 80, y: 45 } },
      { id: 'history', label: 'History', position: { x: 92, y: 50 } },
      { id: 'writing', label: 'Writing', position: { x: 92, y: 65 } },
    ],
  },
  {
    id: 'technology',
    label: 'Technology',
    color: '#72b7b4',
    position: { x: 72, y: 76 },
    children: [
      { id: 'software', label: 'Software', position: { x: 62, y: 65 } },
      { id: 'robotics', label: 'Robotics', position: { x: 66, y: 82 } },
      { id: 'networks', label: 'Networks', position: { x: 79, y: 64 } },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    color: '#d0b574',
    position: { x: 50, y: 78 },
    children: [
      { id: 'marketing', label: 'Marketing', position: { x: 42, y: 73 } },
      { id: 'accounting', label: 'Accounting', position: { x: 58, y: 73 } },
      { id: 'operations', label: 'Operations', position: { x: 40, y: 90 } },
    ],
  },
  {
    id: 'health',
    label: 'Health',
    color: '#d18c98',
    position: { x: 22, y: 75 },
    children: [
      { id: 'public-health', label: 'Public health', position: { x: 9, y: 85 } },
      { id: 'nursing', label: 'Nursing', position: { x: 34, y: 64 } },
      { id: 'rehabilitation', label: 'Rehabilitation', position: { x: 15, y: 61 } },
    ],
  },
  {
    id: 'education',
    label: 'Education',
    color: '#9a9acb',
    position: { x: 13, y: 50 },
    children: [
      { id: 'teaching', label: 'Teaching', position: { x: 8, y: 37 } },
      { id: 'learning-design', label: 'Learning design', position: { x: 8, y: 63 } },
    ],
  },
]
