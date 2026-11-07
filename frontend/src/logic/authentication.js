const DEMO_USERNAME = 'student@mdc.edu'
const DEMO_PASSWORD = 'MDC2026'

/**
 * Local demo authentication only. Replace this module when a real auth service
 * is agreed and available; no credentials are sent to a server.
 */
export function authenticate(username, password) {
  return (
    username.trim().toLowerCase() === DEMO_USERNAME &&
    password === DEMO_PASSWORD
  )
}
