/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RpgProgressHeader from './RpgProgressHeader.jsx'

const makeProgress = (missions, totalXp) => ({
  id: 'progress-session',
  total_xp: totalXp,
  missions,
  notice: 'Temporary demo progress.',
})

const mission = (id, completed = false) => ({
  id,
  title: `Mission ${id}`,
  instruction: 'Complete the activity.',
  resource_ids: [],
  completed,
  xp_reward: 10,
})

describe('RpgProgressHeader', () => {
  it('shows actual backend path XP and mission completion without inventing a level', () => {
    render(
      <RpgProgressHeader
        progress={makeProgress([mission('one', true), mission('two')], 10)}
        syncing={false}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('PATH STATUS')).toBeTruthy()
    expect(screen.getByText('ACTIVE')).toBeTruthy()
    expect(screen.getByText('PATH XP')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1')
    expect(screen.queryByText('CAREER LEVEL')).toBeNull()
  })

  it('shows a completed path when every backend mission is complete', () => {
    render(
      <RpgProgressHeader
        progress={makeProgress([mission('one', true), mission('two', true)], 20)}
        syncing={false}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('COMPLETE')).toBeTruthy()
    expect(screen.getByText('0 missions remaining')).toBeTruthy()
    expect(screen.getByText('20')).toBeTruthy()
  })
})
