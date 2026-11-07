import { useState } from 'react'
import ExperienceLayout from './ExperienceLayout.jsx'

export const OPTIONAL_QUIZ_QUESTIONS = [
  'What kind of future or career would you like to work toward, and why?',
  'What are some personal interests, hobbies, or subjects you would like your RPG journey to incorporate?',
  'What motivates you most when working toward a difficult goal?',
  'What kind of challenges or activities would you enjoy most in your RPG journey?',
  'Imagine your ideal future. What would you like your life, work, and accomplishments to look like?',
]

export default function OptionalQuiz({ answers, onAnswersChange, onComplete, onSkipQuiz, onBackToExplorer }) {
  const [questionIndex, setQuestionIndex] = useState(0)
  const question = OPTIONAL_QUIZ_QUESTIONS[questionIndex]
  const isLastQuestion = questionIndex === OPTIONAL_QUIZ_QUESTIONS.length - 1

  function updateAnswer(value) {
    const nextAnswers = [...answers]
    nextAnswers[questionIndex] = value
    onAnswersChange(nextAnswers)
  }

  function advance() {
    if (isLastQuestion) onComplete()
    else setQuestionIndex((index) => index + 1)
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
          <strong id="quiz-personalization-title">Personalization Notice</strong>
          <p>By filling out this optional quiz, you agree that your answers may be analyzed by AI to create a personalized RPG experience tailored to your interests, goals, and preferences. Skipping the quiz does not grant this consent.</p>
        </section>

        <div className="quiz-progress" aria-hidden="true">
          <span style={{ width: `${((questionIndex + 1) / OPTIONAL_QUIZ_QUESTIONS.length) * 100}%` }} />
        </div>
        <p className="quiz-question-count" aria-live="polite">Question {questionIndex + 1} of {OPTIONAL_QUIZ_QUESTIONS.length}</p>
        <label className="quiz-question" htmlFor="optional-quiz-answer">{question}</label>
        <textarea
          id="optional-quiz-answer"
          value={answers[questionIndex] || ''}
          onChange={(event) => updateAnswer(event.target.value)}
          placeholder="Write as much or as little as you like..."
          rows={6}
        />
        <p className="quiz-reassurance">There are no right answers. You can skip any question.</p>

        <div className="quiz-controls">
          <button className="pixel-quiet-button" type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((index) => Math.max(0, index - 1))}>Previous</button>
          <button className="quiz-skip-question" type="button" onClick={advance}>Skip Question</button>
          <button className="pixel-button quiz-next" type="button" onClick={advance}>{isLastQuestion ? 'Continue' : 'Next'}</button>
        </div>
        <div className="quiz-footer-controls">
          <button type="button" onClick={onBackToExplorer}>← Back to Bubble Explorer</button>
          <button type="button" onClick={onSkipQuiz}>Skip Quiz</button>
        </div>
      </article>
    </ExperienceLayout>
  )
}
