/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OptionalQuiz from './OptionalQuiz.jsx'

function renderQuiz() {
  const onComplete = vi.fn()
  const onSkipQuiz = vi.fn()
  const onAnswersChange = vi.fn()
  render(
    <OptionalQuiz
      answers={[]}
      onAnswersChange={onAnswersChange}
      onComplete={onComplete}
      onSkipQuiz={onSkipQuiz}
      onBackToExplorer={vi.fn()}
    />,
  )
  return { onComplete, onSkipQuiz, onAnswersChange }
}

describe('OptionalQuiz RPG consent', () => {
  it('starts with RPG personalization consent unchecked', () => {
    renderQuiz()
    expect(screen.getByRole('checkbox', { name: /use my mapped answers/i })).toHaveProperty('checked', false)
  })

  it('does not grant consent when continuing without sharing', () => {
    const { onComplete, onSkipQuiz } = renderQuiz()
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: 'NEXT' }))
    fireEvent.click(screen.getByRole('button', { name: /continue without sharing/i }))
    expect(onComplete).not.toHaveBeenCalled()
    expect(onSkipQuiz).toHaveBeenCalledTimes(1)
  })

  it('completes only after the student explicitly opts in', () => {
    const { onComplete, onSkipQuiz } = renderQuiz()
    fireEvent.click(screen.getByRole('checkbox', { name: /use my mapped answers/i }))
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByRole('button', { name: 'NEXT' }))
    fireEvent.click(screen.getByRole('button', { name: /continue with rpg personalization/i }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onSkipQuiz).not.toHaveBeenCalled()
  })

  it('clears a skipped question instead of retaining a previously typed answer', () => {
    const { onAnswersChange } = renderQuiz()
    fireEvent.change(screen.getByLabelText(OPTIONAL_QUESTION_LABEL), { target: { value: 'draft answer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skip Question' }))
    expect(onAnswersChange).toHaveBeenLastCalledWith([''])
  })
})

const OPTIONAL_QUESTION_LABEL = 'What kind of future or career would you like to work toward, and why?'
