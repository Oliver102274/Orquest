import { useState } from 'react'
import ExperienceLayout from './ExperienceLayout.jsx'
import './OptionalQuiz.css'

export const OPTIONAL_QUIZ_QUESTIONS = [
  'What kind of future or career would you like to work toward, and why?',
  'What are some personal interests, hobbies, or subjects you would like your RPG journey to incorporate?',
  'What motivates you most when working toward a difficult goal?',
  'What kind of challenges or activities would you enjoy most in your RPG journey?',
  'Imagine your ideal future. What would you like your life, work, and accomplishments to look like?',
]

// These indexes follow the existing saved-answer order. Do not reorder without a save-file migration.
const RPG_PROFILE_CONTEXT = {
  0: { field: 'goals', label: 'Career or future goal:' },
  1: { field: 'preferences', label: 'Interests, hobbies, and subjects:' },
  3: { field: 'preferences', label: 'Preferred challenges and activities:' },
  4: { field: 'goals', label: 'Ideal future:' },
}

function answerLimitFor(index) {
  const mapping = RPG_PROFILE_CONTEXT[index]
  return mapping ? Math.max(0, 1000 - [...`${mapping.label} `].length) : 1000
}

export default function OptionalQuiz({ answers, onAnswersChange, onComplete, onSkipQuiz, onBackToExplorer }) {
  const [questionIndex, setQuestionIndex] = useState(0)
  const [shareForRpg, setShareForRpg] = useState(false)
  const [validationError, setValidationError] = useState('')
  const question = OPTIONAL_QUIZ_QUESTIONS[questionIndex]
  const isLastQuestion = questionIndex === OPTIONAL_QUIZ_QUESTIONS.length - 1
  const currentAnswer = answers[questionIndex] || ''
  const answerLimit = answerLimitFor(questionIndex)
  const answerLength = [...currentAnswer].length
  const answerTooLong = answerLength > answerLimit

  function updateAnswer(value) {
    const nextAnswers = [...answers]
    nextAnswers[questionIndex] = value
    onAnswersChange(nextAnswers)
    setValidationError('')
  }

  function finish() {
    if (answerTooLong) {
      setValidationError(`Shorten this answer to ${answerLimit} characters or fewer so its context label fits the backend's 1,000-character field limit.`)
      return
    }
    if (shareForRpg) onComplete()
    else onSkipQuiz()
  }

  function advance() {
    if (answerTooLong) {
      setValidationError(`Shorten this answer to ${answerLimit} characters or fewer so its context label fits the backend's 1,000-character field limit.`)
      return
    }
    if (isLastQuestion) {
      finish()
    } else {
      setQuestionIndex((index) => index + 1)
      setValidationError('')
    }
  }

  function skipCurrentQuestion() {
    const nextAnswers = [...answers]
    nextAnswers[questionIndex] = ''
    onAnswersChange(nextAnswers)
    setValidationError('')
    if (isLastQuestion) {
      if (shareForRpg) onComplete()
      else onSkipQuiz()
    } else {
      setQuestionIndex((index) => index + 1)
    }
  }

  return (
    <ExperienceLayout className="optional-quiz-route" label="Optional journey quiz">
      <article className="experience-card quiz-card">
        <div className="experience-heading-row">
          <div>
            <span className="experience-kicker">OPTIONAL / YOUR JOURNEY</span>
            <h1>A little more about you.</h1>
          </div>
          <span className="quiz-progress-count">{questionIndex + 1} / {OPTIONAL_QUIZ_QUESTIONS.length}</span>
        </div>

        <section className="quiz-personalization-notice" aria-labelledby="quiz-personalization-title">
          <strong id="quiz-personalization-title">RPG personalization is optional</strong>
          <p>Your answers stay separate from career matching. Only if you check the consent box below will the mapped, nonblank answers be included when RPG progress is created. Career/future goal and ideal future map to goals; interests and preferred challenges map to preferences. The motivation answer has no approved backend field and is not sent. Answers are never silently shortened.</p>
        </section>

        <div className="quiz-progress" aria-hidden="true">
          <span style={{ width: `${((questionIndex + 1) / OPTIONAL_QUIZ_QUESTIONS.length) * 100}%` }} />
        </div>
        <p className="quiz-question-count" aria-live="polite">Question {questionIndex + 1} of {OPTIONAL_QUIZ_QUESTIONS.length}</p>
        <label className="quiz-question" htmlFor="optional-quiz-answer">{question}</label>
        <textarea
          id="optional-quiz-answer"
          value={currentAnswer}
          onChange={(event) => updateAnswer(event.target.value)}
          placeholder="Write as much or as little as you like..."
          rows={6}
          aria-invalid={answerTooLong || Boolean(validationError)}
          aria-describedby="optional-quiz-answer-count"
        />
        <div className={`quiz-answer-count ${answerTooLong ? 'is-over-limit' : ''}`} id="optional-quiz-answer-count">
          <span>{answerLength} / {answerLimit} characters</span>
          {RPG_PROFILE_CONTEXT[questionIndex]
            ? <span>Maps to {RPG_PROFILE_CONTEXT[questionIndex].field}</span>
            : <span>Not sent to RPG profile</span>}
        </div>
        {validationError && <p className="quiz-answer-error" role="alert">{validationError}</p>}
        <p className="quiz-reassurance">There are no right answers. You can skip any question.</p>

        <label className="quiz-rpg-consent">
          <input
            type="checkbox"
            checked={shareForRpg}
            onChange={(event) => setShareForRpg(event.target.checked)}
          />
          <span>
            <strong>Yes, use my mapped answers to personalize my RPG journey.</strong>
            <small>This is a separate, optional choice. It is not selected by default. Continuing without consent discards these optional answers.</small>
          </span>
        </label>

        <div className="quiz-controls">
          <button className="pixel-quiet-button" type="button" disabled={questionIndex === 0} onClick={() => { setQuestionIndex((index) => Math.max(0, index - 1)); setValidationError('') }}>Previous</button>
          <button className="quiz-skip-question" type="button" onClick={skipCurrentQuestion}>Skip Question</button>
          <button className="pixel-button quiz-next" type="button" onClick={advance}>
            {isLastQuestion ? (shareForRpg ? 'CONTINUE WITH RPG PERSONALIZATION' : 'CONTINUE WITHOUT SHARING') : 'NEXT'}
          </button>
        </div>
        <div className="quiz-footer-controls">
          <button type="button" onClick={onBackToExplorer}>← Back to Bubble Explorer</button>
          <button type="button" onClick={onSkipQuiz}>Skip Quiz</button>
        </div>
      </article>
    </ExperienceLayout>
  )
}
