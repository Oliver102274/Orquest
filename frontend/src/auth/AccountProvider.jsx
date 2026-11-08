import { createContext, useContext, useState } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import './account.css'

export const AccountContext = createContext({ enabled: false, identity: 'guest', authenticated: false })
export const useAccount = () => useContext(AccountContext)

export function authConfiguration(env = import.meta.env) {
  return {
    enabled: env.VITE_AUTH0_ENABLED === 'true',
    domain: env.VITE_AUTH0_DOMAIN || '', clientId: env.VITE_AUTH0_CLIENT_ID || '',
    audience: env.VITE_AUTH0_AUDIENCE || '',
  }
}

function Session({ children, returnedState, clearNavigation }) {
  const auth = useAuth0()
  const [guest, setGuest] = useState(false)
  const [message, setMessage] = useState('')
  const authenticated = auth.isAuthenticated && !guest
  const value = {
    enabled: true, authenticated, identity: authenticated ? auth.user.sub : 'guest',
    name: authenticated ? (auth.user.name || 'Orquest account') : '',
    returnedState: authenticated ? returnedState : null, loading: auth.isLoading && !guest,
    error: message || (auth.error ? 'Sign-in unavailable. Try signing in again or continue as a guest.' : ''),
    getToken: () => auth.getAccessTokenSilently(),
    login: async (navigation, signup = false) => {
      setGuest(false)
      try {
        await auth.loginWithRedirect({ appState: { navigation }, authorizationParams: signup ? { screen_hint: 'signup' } : {} })
      } catch { setMessage('Sign-in unavailable. Continue as a guest or try again.') }
    },
    logout: async () => {
      clearNavigation()
      setGuest(true) // Clear game state immediately, even if remote logout fails.
      try { await auth.logout({ logoutParams: { returnTo: window.location.origin } }) }
      catch { setMessage('Local session cleared. Auth0 logout could not complete.') }
    },
    guest: () => setGuest(true),
  }
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export default function AccountProvider({ children, config = authConfiguration() }) {
  const [returnedState, setReturnedState] = useState(null)
  if (!config.enabled) return children
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(config.domain) || !config.clientId || config.audience !== 'https://api.orquest.app') {
    return <><p role="alert">Account login is not configured. Guest access remains available.</p>{children}</>
  }
  return <Auth0Provider domain={config.domain} clientId={config.clientId} cacheLocation="memory" useRefreshTokens={false}
    authorizationParams={{ redirect_uri: window.location.origin, audience: config.audience, scope: 'openid profile' }}
    onRedirectCallback={(state) => { setReturnedState(state?.navigation || null); window.history.replaceState({}, '', '/') }}>
    <Session returnedState={returnedState} clearNavigation={() => setReturnedState(null)}>{children}</Session>
  </Auth0Provider>
}

export function AccountControls({ navigation, onGuest, storage }) {
  const account = useAccount()
  if (!account.enabled) return null
  return <section aria-label="Orquest account" className="account-controls">
    {account.error && <p role="alert">{account.error}</p>}
    {account.authenticated ? <>
      <span>Signed in: {account.name}</span>
      <p>{storage === 'persistent_postgres' ? 'Account progress storage is available.' : 'Progress is temporary unless account storage is confirmed.'}</p>
      <button type="button" className="pixel-quiet-button" onClick={account.logout}>Log out</button>
    </> : <>
      <button type="button" className="pixel-quiet-button" onClick={() => account.login(navigation)}>Log in</button>
      <button type="button" className="pixel-quiet-button" onClick={() => account.login(navigation, true)}>Sign up</button>
      <button type="button" className="pixel-quiet-button" onClick={() => { account.guest(); onGuest() }}>Continue as Guest</button>
    </>}
  </section>
}
