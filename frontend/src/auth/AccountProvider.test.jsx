/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AccountProvider, { AccountContext, AccountControls, authConfiguration } from './AccountProvider.jsx'
import App from '../App.jsx'
import RpgGame from '../components/RpgGame.jsx'
import { accountRequest, getSwipeCards } from '../services/api.js'

const sdk = vi.hoisted(() => ({ props: null, auth: {} }))
vi.mock('@auth0/auth0-react', () => ({
  Auth0Provider: (props) => { sdk.props = props; return props.children },
  useAuth0: () => sdk.auth,
}))
vi.mock('../components/BubbleExplorer.jsx', () => ({ default: () => <div>Explorer</div> }))
const config = { enabled: true, domain: 'example.auth0.com', clientId: 'public-client', audience: 'https://api.orquest.app' }

it('rejects a different configured audience without initializing Auth0', () => {
  render(<AccountProvider config={{ ...config, audience: 'https://wrong-api.example' }}><App /></AccountProvider>)
  expect(screen.getByRole('alert').textContent).toMatch(/not configured/)
  expect(sdk.props).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
const career = { career_id: 'career_test', title: 'Synthetic occupation', summary: 'Test', requirements: [], sources: [], mdc_resources: [], external_resources: [] }
const mission = { id: 'mission-test', title: 'Synthetic mission', instruction: 'Practice', resource_ids: [], completed: false, xp_reward: 10 }
const roadmap = { target_occupation: career, metadata: { status: 'deterministic', provider: 'deterministic', review_required: true },
  suggested_missions: [mission], relevant_skills_and_qualifications: [], mdc_pathways: [], alternative_resources: [], evidence_gaps: [], source_urls: [] }
const progress = { id: 'progress-test', roadmap, missions: [mission], total_xp: 0, storage: 'persistent_postgres', notice: 'Saved to your account.' }
const account = (identity = 'A') => ({ enabled: true, authenticated: true, identity, name: identity,
  getToken: vi.fn(async () => 'mock-access-token'), logout: vi.fn(), returnedState: { screen: 'bubbles', experienceScreen: 'rpg' } })
const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })

beforeEach(() => {
  sdk.props = null
  sdk.auth = { isLoading: false, isAuthenticated: false, loginWithRedirect: vi.fn(async () => {}), logout: vi.fn(async () => {}), getAccessTokenSilently: vi.fn(async () => 'mock-access-token') }
  vi.stubGlobal('fetch', vi.fn(async () => response({})))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('defaults to guest and does not mount Auth0', () => {
  expect(authConfiguration({}).enabled).toBe(false)
  render(<AccountProvider config={{ enabled: false }}><App /></AccountProvider>)
  expect(screen.getByRole('button', { name: /Continue as Guest.*Enter the hall/i })).toBeTruthy()
  expect(sdk.props).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

it('invalid configuration preserves guests without contacting Auth0', () => {
  render(<AccountProvider config={{ ...config, audience: '' }}><App /></AccountProvider>)
  expect(screen.getByRole('alert').textContent).toMatch(/not configured/)
  expect(sdk.props).toBeNull()
})

it('uses memory access tokens, API audience, and returns navigation through SDK appState', async () => {
  const navigation = { screen: 'bubbles', experienceScreen: 'rpg', target_id: 'career_test' }
  render(<AccountProvider config={config}><AccountControls navigation={navigation} onGuest={() => {}} /></AccountProvider>)
  expect(sdk.props.cacheLocation).toBe('memory')
  expect(sdk.props.useRefreshTokens).toBe(false)
  expect(sdk.props.authorizationParams.audience).toBe(config.audience)
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
  await waitFor(() => expect(sdk.auth.loginWithRedirect).toHaveBeenCalledWith({ appState: { navigation }, authorizationParams: {} }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
  await waitFor(() => expect(sdk.auth.loginWithRedirect).toHaveBeenLastCalledWith({ appState: { navigation }, authorizationParams: { screen_hint: 'signup' } }))
})

it('shows safe authentication errors and keeps guest access', () => {
  sdk.auth.error = new Error('sensitive provider diagnostic')
  const onGuest = vi.fn()
  render(<AccountProvider config={config}><AccountControls navigation={{}} onGuest={onGuest} /></AccountProvider>)
  expect(screen.getByRole('alert').textContent).not.toContain('sensitive')
  fireEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }))
  expect(onGuest).toHaveBeenCalled()
})

it('attaches access token only to account requests and handles expiry without a request', async () => {
  fetch.mockResolvedValue(response({ cards: [] }))
  await getSwipeCards()
  expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined()
  const getToken = vi.fn(async () => 'mock-access-token')
  await accountRequest('/api/me', getToken)
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer mock-access-token')
  const count = fetch.mock.calls.length
  await expect(accountRequest('/api/me', async () => { throw Error('private'); })).rejects.toThrow(/session expired/)
  expect(fetch.mock.calls.length).toBe(count)
  await expect(accountRequest('/api/career-questions', getToken)).rejects.toThrow(/Invalid account endpoint/)
})

it('rejects cross-origin token routing in production', async () => {
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_API_BASE_URL', 'https://different.example')
  await expect(accountRequest('/api/me', async () => 'mock')).rejects.toThrow(/same origin/)
  expect(fetch).not.toHaveBeenCalled()
})

it('starts account missions and sends completion without client XP or subject', async () => {
  fetch.mockResolvedValue(response(progress))
  const onProgressChange = vi.fn()
  const a = account()
  const props = { activeTargetCareer: career, careerPaths: [], quizAnswers: [], onProgressChange, accountStorage: 'persistent_postgres' }
  const view = render(<AccountContext.Provider value={a}><RpgGame {...props} /></AccountContext.Provider>)
  fireEvent.click(screen.getByRole('button', { name: 'START SAVED MISSIONS' }))
  await waitFor(() => expect(onProgressChange).toHaveBeenCalled())
  expect(fetch.mock.calls[0][0]).toMatch(/\/api\/account\/progress$/)
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ target_id: career.career_id })
  const session = onProgressChange.mock.calls[0][0]
  expect(session.kind).toBe('account')
  expect(session.access_token).toBeUndefined()
  view.rerender(<AccountContext.Provider value={a}><RpgGame {...props} progressSession={session} /></AccountContext.Provider>)
  fetch.mockResolvedValue(response({ ...progress, total_xp: 10, missions: [{ ...mission, completed: true }] }))
  fireEvent.click(screen.getByRole('button', { name: /Complete mission/ }))
  await waitFor(() => expect(onProgressChange).toHaveBeenCalledTimes(2))
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ completed: true })
})

it('restores account XP on reload and clears it on user change and logout', async () => {
  let identity = 'A'
  fetch.mockImplementation(async url => {
    if (url.endsWith('/api/me')) return response({ sub: identity, storage: 'persistent_postgres' })
    if (url.endsWith('/api/account/progress')) return response({ selected_target: career.career_id, progress: identity === 'A' ? [{ ...progress, total_xp: 10, missions: [{ ...mission, completed: true }] }] : [] })
    if (url.includes('/api/careers/')) return response(career)
    throw new Error('Unexpected request')
  })
  const view = render(<AccountContext.Provider value={account('A')}><App /></AccountContext.Provider>)
  await screen.findByText('Demo XP: 10')
  view.unmount()
  const reloaded = render(<AccountContext.Provider value={account('A')}><App /></AccountContext.Provider>)
  await screen.findByText('Demo XP: 10')
  identity = 'B'
  reloaded.rerender(<AccountContext.Provider value={account('B')}><App /></AccountContext.Provider>)
  expect(screen.queryByText('Demo XP: 10')).toBeNull()
  await screen.findByRole('button', { name: 'START SAVED MISSIONS' })
  reloaded.rerender(<AccountContext.Provider value={{ enabled: false, identity: 'guest', authenticated: false }}><App /></AccountContext.Provider>)
  expect(screen.queryByText('Demo XP: 10')).toBeNull()
  expect(screen.queryByText('Synthetic mission')).toBeNull()
})

it('database failure is visible and does not promise saved missions', async () => {
  fetch.mockResolvedValue(response({ error: { message: 'Account storage unavailable; no save was confirmed.' } }, false, 503))
  render(<AccountContext.Provider value={account()}><App /></AccountContext.Provider>)
  await screen.findByText(/no save was confirmed/)
  expect(screen.getByRole('button', { name: 'ACCOUNT STORAGE UNAVAILABLE' }).disabled).toBe(true)
})

it('returns to the prior RPG screen after login and saves the selected guest target', async () => {
  const a = { ...account(), returnedState: { screen: 'bubbles', experienceScreen: 'rpg', target_id: career.career_id } }
  fetch.mockImplementation(async (url, options = {}) => {
    if (url.endsWith('/api/me')) return response({ sub: 'A', storage: 'persistent_postgres' })
    if (url.endsWith('/api/account/progress')) return response({ selected_target: null, progress: [] })
    if (url.includes('/api/careers/')) return response(career)
    if (url.endsWith('/api/account/selection')) return response({ selected_target: JSON.parse(options.body).target_id })
    throw Error('Unexpected request')
  })
  render(<AccountContext.Provider value={a}><App /></AccountContext.Provider>)
  await screen.findByText('Synthetic occupation')
  await waitFor(() => expect(fetch.mock.calls.some(([url, options]) => url.endsWith('/api/account/selection') && JSON.parse(options.body).target_id === career.career_id)).toBe(true))
  expect(screen.getByRole('button', { name: 'START SAVED MISSIONS' }).disabled).toBe(false)
})
