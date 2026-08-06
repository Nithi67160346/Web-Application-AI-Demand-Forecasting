import jwt, { JwtPayload } from 'jsonwebtoken'
import { UserRole } from '@prisma/client'
import { env } from '../config'
import { AppError } from '../utils/app-error'

export type AccessTokenPayload = JwtPayload & {
  sid: string
  role: UserRole
}

export function createAccessToken(userId: string, sessionId: string, role: UserRole): string {
  return jwt.sign(
    { sid: sessionId, role },
    env.jwtSecret,
    {
      subject: userId,
      expiresIn: env.accessTokenExpiresInSeconds,
    },
  )
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret)
    if (
      typeof decoded === 'string'
      || typeof decoded.sub !== 'string'
      || typeof decoded.sid !== 'string'
      || !Object.values(UserRole).includes(decoded.role as UserRole)
    ) {
      throw new Error('Invalid token payload')
    }

    return decoded as AccessTokenPayload
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'token ไม่ถูกต้องหรือหมดอายุ')
  }
}

