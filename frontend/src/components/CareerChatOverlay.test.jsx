/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CareerChatOverlay from './CareerChatOverlay.jsx'

function renderChat(overrides = {}) {
  const onSend = vi.fn()
  const onDraftChange = vi.fn()
  render(
    <CareerChatOverlay
      hasOpened
      expanded
      draft="How do I start?"
      onDraftChange={onDraftChange}
      onToggle={vi.fn()}
      careerTitle="Software Developer"
      chatEntries={[]}
      canSend
      onSend={onSend}
      personalizationConsent={false}
      onPersonalizationConsentChange={vi.fn()}
      {...overrides}
    />,
  )
  return { onSend, onDraftChange }
}

describe('CareerChatOverlay composer', () => {
  it('removes the obsolete send-instructions panel', () => {
    renderChat()
    expect(screen.queryByText(/Questions are sent only when you press Send/i)).toBeNull()
    expect(screen.queryByText(/backend does not accept conversation history/i)).toBeNull()
  })

  it('sends with Enter through the form submission path', () => {
    const { onSend } = renderChat()
    fireEvent.keyDown(screen.getByLabelText('Career chat question draft'), { key: 'Enter', code: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('How do I start?')
  })

  it('keeps Shift+Enter as a newline and does not submit', () => {
    const { onSend } = renderChat()
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
    screen.getByLabelText('Career chat question draft').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not submit during IME composition', () => {
    const { onSend } = renderChat()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(event, 'isComposing', { value: true })
    screen.getByLabelText('Career chat question draft').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('uses the same submit callback for the Send button', () => {
    const { onSend } = renderChat()
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    expect(onSend).toHaveBeenCalledWith('How do I start?')
  })

  it('does not submit a blank draft', () => {
    const blank = renderChat({ draft: '   ' })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    expect(blank.onSend).not.toHaveBeenCalled()
  })

  it('does not submit while a request is in progress', () => {
    const pending = renderChat({ loading: true })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    expect(pending.onSend).not.toHaveBeenCalled()
  })
})
