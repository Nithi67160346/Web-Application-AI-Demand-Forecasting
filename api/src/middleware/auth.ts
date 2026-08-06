import { NextFunction, Request, Response } from 'express'
import { UserRole } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { verifyAccessToken } from '../lib/tokens'
import { AppError } from '../utils/app-error'

export type AuthContext = {
  userId: string
  sessionId: string
  role: UserRole
}

export type AuthenticatedRequest = Request & {
  auth?: AuthContext
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const value = req.header('authorization')
    if (!value || !/^Bearer\s+/i.test(value)) {
      throw new AppError(401, 'UNAUTHORIZED', 'กรุณาส่ง Bearer token')
    }

    const token = value.replace(/^Bearer\s+/i, '').trim()
    const payload = verifyAccessToken(token)
    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    })

    if (!session || session.expiresAt <= new Date() || session.user.id !== payload.sub) {
      throw new AppError(401, 'UNAUTHORIZED', 'session ไม่ถูกต้องหรือหมดอายุ')
    }

    ;(req as AuthenticatedRequest).auth = {
      userId: session.user.id,
      sessionId: session.id,
      role: session.user.role,
    }
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const auth = (req as AuthenticatedRequest).auth
  if (!auth || auth.role !== UserRole.ADMIN) {
    next(new AppError(403, 'FORBIDDEN', 'ต้องใช้สิทธิ์ผู้ดูแลระบบ'))
    return
  }
  next()
}

