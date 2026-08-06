import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { comparePassword, hashPassword } from '../lib/password'
import { createAccessToken } from '../lib/tokens'
import { requireAuth, AuthenticatedRequest } from '../middleware/auth'
import { AppError } from '../utils/app-error'
import { asyncHandler } from '../utils/async-handler'
import { parse } from '../utils/validate'
import { serializeUser } from '../utils/serializers'
import { env } from '../config'

const router = Router()

const registerSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9_.-]+$/, 'ใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่างเท่านั้น'),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8).max(72),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(30).optional(),
})

const loginSchema = z.object({
  identifier: z.string().trim().toLowerCase().min(3),
  password: z.string().min(1),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
})

async function createSession(userId: string, role: Parameters<typeof createAccessToken>[2]) {
  const sessionId = randomUUID()
  const expiresAt = new Date(Date.now() + env.accessTokenExpiresInSeconds * 1000)
  await prisma.session.create({
    data: { id: sessionId, userId, expiresAt },
  })

  return {
    accessToken: createAccessToken(userId, sessionId, role),
    tokenType: 'Bearer',
    expiresIn: env.accessTokenExpiresInSeconds,
  }
}

router.post('/register', asyncHandler(async (req, res) => {
  const input = parse(registerSchema, req.body)
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: input.username }, { email: input.email }] },
    select: { username: true, email: true },
  })

  if (existing) {
    const field = existing.username === input.username ? 'username' : 'email'
    throw new AppError(409, 'DUPLICATE_RESOURCE', `${field} นี้ถูกใช้งานแล้ว`)
  }

  const user = await prisma.user.create({
    data: {
      username: input.username,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
    },
  })
  const session = await createSession(user.id, user.role)

  res.status(201).json({
    data: {
      ...session,
      user: serializeUser(user, true),
    },
  })
}))

router.post('/login', asyncHandler(async (req, res) => {
  const input = parse(loginSchema, req.body)
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: input.identifier }, { email: input.identifier }] },
  })

  if (!user || !(await comparePassword(input.password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'username/email หรือรหัสผ่านไม่ถูกต้อง')
  }

  const session = await createSession(user.id, user.role)
  res.json({
    data: {
      ...session,
      user: serializeUser(user, true),
    },
  })
}))

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  await prisma.session.deleteMany({ where: { id: auth.sessionId } })
  res.json({ data: { message: 'ออกจากระบบแล้ว' } })
}))

router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const input = parse(changePasswordSchema, req.body)
  const auth = (req as AuthenticatedRequest).auth!
  const user = await prisma.user.findUnique({ where: { id: auth.userId } })

  if (!user || !(await comparePassword(input.currentPassword, user.passwordHash))) {
    throw new AppError(401, 'INVALID_PASSWORD', 'รหัสผ่านเดิมไม่ถูกต้อง')
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: auth.userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    }),
    prisma.session.deleteMany({ where: { userId: auth.userId } }),
  ])

  res.json({ data: { message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่' } })
}))

export default router
