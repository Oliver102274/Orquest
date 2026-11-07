import { useState } from 'react'
import OrquestLogo from './OrquestLogo.jsx'
import { authenticate } from '../logic/authentication.js'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()

    if (!authenticate(username, password)) {
      setError('Invalid Username or Password. Please Try Again!')
      return
    }

    setError('')
    onLogin()
  }

  return (
    <section className="login-scene">
      <div className="concert-hall" aria-hidden="true">
        <div className="hall-ceiling" />
        <div className="hall-balcony balcony-back" />
        <div className="hall-balcony balcony-front" />
        <div className="hall-seat-row seat-row-one" />
        <div className="hall-seat-row seat-row-two" />
        <div className="hall-floor" />
        <div className="conductor-shadow"><span /></div>
      </div>

      <div className="login-stage">
        <div className="login-logo"><OrquestLogo /></div>
        <div className="pixel-login-card">
          <div className="pixel-card-ribbon"><span>PLAYER ACCESS</span><span className="ribbon-light" /></div>
          <p className="pixel-kicker">DEMO BUILD / 001</p>
          <h1>Take your place.</h1>
          <p className="login-intro">Your next path starts with one small choice.</p>

          <form className="login-form" onSubmit={handleSubmit} noValidate autoComplete="off">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="demo-username"
              type="text"
              inputMode="email"
              autoComplete="off"
              placeholder="you@example.com"
              value={username}
              onChange={(event) => { setUsername(event.target.value); setError('') }}
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="demo-password"
              type="password"
              autoComplete="off"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError('') }}
            />

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="pixel-button login-submit" type="submit">
              <span>Enter the hall</span><span aria-hidden="true">▶</span>
            </button>
          </form>

          <div className="demo-credentials">
            <span className="demo-badge">DEMO</span>
            <span>student@mdc.edu</span>
            <i />
            <span>MDC2026</span>
          </div>
        </div>
        <p className="login-footnote">LOCAL PREVIEW <span>·</span> NO ACCOUNT OR BACKEND CONNECTION</p>
      </div>
    </section>
  )
}
