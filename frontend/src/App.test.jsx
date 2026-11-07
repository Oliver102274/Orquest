/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App.jsx'

afterEach(cleanup)

function enterDemoCredentials() {
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'student@mdc.edu' },
  })
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'MDC2026' },
  })
  fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))
}

describe('Login → Swipe → Bubble Explorer', () => {
  it('shows the agreed error for incorrect demo credentials', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'wrong@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /enter the hall/i }))

    expect(screen.getByRole('alert').textContent).toBe(
      'Invalid Username or Password. Please Try Again!',
    )
  })

  it('opens the connected category map after Agree/Disagree choices', () => {
    render(<App />)
    enterDemoCredentials()

    expect(screen.getByRole('heading', { name: /what kind of work feels like you/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agree' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }))

    expect(screen.getByRole('heading', { name: 'Bubble Explorer' })).toBeTruthy()
    expect(screen.getByLabelText('Search bubble map')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle Math' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle Sciences' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle Social science' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Toggle Education' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Statistics under Math' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Statistics under Math' }))
    expect(screen.getByText('Statistics', { selector: '.guide-selection' })).toBeTruthy()

    const mathFilter = screen.getByRole('button', { name: 'Toggle Math' })
    fireEvent.click(mathFilter)
    expect(mathFilter.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Statistics under Math' }).className).toContain('is-muted')

    fireEvent.click(mathFilter)
    expect(mathFilter.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Statistics under Math' }).className).not.toContain('is-muted')

    fireEvent.change(screen.getByLabelText('Search bubble map'), {
      target: { value: 'psychology' },
    })
    expect(screen.getByRole('button', { name: 'Psychology under Social science' }).className).toContain('is-search-match')
    expect(screen.getByText('GRAY FAMILIES ARE MUTED, NOT REMOVED')).toBeTruthy()
  })
})
