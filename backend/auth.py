"""Auth0 API access tokens only; never accept guest tokens or ID tokens."""
import os
import re
import jwt
from fastapi import Header, HTTPException


class Auth0Verifier:
    def __init__(self):
        self.enabled = os.getenv('AUTH0_ENABLED', 'false').lower() == 'true'
        self.domain = os.getenv('AUTH0_DOMAIN', '')
        self.audience = os.getenv('AUTH0_AUDIENCE', '')
        self.jwks = None
        if self.enabled and re.fullmatch(r'[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', self.domain) and self.audience == 'https://api.orquest.app':
            self.jwks = jwt.PyJWKClient(f'https://{self.domain}/.well-known/jwks.json', timeout=5)

    def __call__(self, authorization: str | None = Header(default=None)):
        if not self.enabled or self.jwks is None:
            raise HTTPException(503, 'Account login is unavailable; continue as a guest.')
        if not authorization or not authorization.startswith('Bearer '):
            raise HTTPException(401, 'Sign in to access your account.')
        token = authorization[7:]
        if len(token) > 16384:
            raise HTTPException(401, 'Invalid account session. Sign in again.')
        try:
            header = jwt.get_unverified_header(token)
            if header.get('alg') != 'RS256' or not header.get('kid'):
                raise jwt.InvalidTokenError()
            key = self.jwks.get_signing_key_from_jwt(token).key
            claims = jwt.decode(token, key, algorithms=['RS256'], audience=self.audience,
                                issuer=f'https://{self.domain}/',
                                options={'require': ['exp', 'iat', 'iss', 'aud', 'sub']})
            subject = claims['sub']
            if not isinstance(subject, str) or not subject.strip() or len(subject) > 256:
                raise jwt.InvalidTokenError()
            return subject
        except jwt.PyJWKClientConnectionError:
            raise HTTPException(503, 'Account verification is temporarily unavailable.') from None
        except (jwt.PyJWTError, ValueError, TypeError):
            raise HTTPException(401, 'Invalid or expired account session. Sign in again.') from None
