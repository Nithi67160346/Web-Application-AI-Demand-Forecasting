import dotenv from 'dotenv'

dotenv.config()

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback

  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

const nodeEnv = process.env.NODE_ENV ?? 'development'
const jwtSecret = process.env.JWT_SECRET
  ?? (nodeEnv === 'production' ? '' : 'local-development-secret-change-me-please-123456')
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters')
}

export const env = {
  nodeEnv,
  port: numberFromEnv('PORT', 3000),
  jwtSecret,
  accessTokenExpiresInSeconds: numberFromEnv('ACCESS_TOKEN_EXPIRES_IN_SECONDS', 28_800),
  corsOrigins: (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}
