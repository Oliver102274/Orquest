export const initialPersonalizationConsents = Object.freeze({
  quiz: false,
  swipes: false,
  careerChat: false,
})

export function setPersonalizationConsent(consents, source, value) {
  if (!Object.hasOwn(consents, source)) return consents
  return { ...consents, [source]: Boolean(value) }
}

export function grantQuizPersonalizationConsent(consents) {
  return setPersonalizationConsent(consents, 'quiz', true)
}
