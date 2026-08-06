import { Router } from 'express'
import { UserRole } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthenticatedRequest } from '../middleware/auth'
import { AppError } from '../utils/app-error'
import { asyncHandler } from '../utils/async-handler'
import { parse, readStringParam } from '../utils/validate'
import { serializeUser } from '../utils/serializers'

const router = Router()

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(80).optional(),
  role: z.nativeEnum(UserRole).optional(),
})

const updateUserSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9_.-]+$/).optional(),
  email: z.string().trim().toLowerCase().email().max(120).optional(),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  role: z.nativeEnum(UserRole).optional(),
})

router.get('/check-username/:name', asyncHandler(async (req, res) => {
  const username = readStringParam(req.params.name, 'username').trim().toLowerCase()
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'username ต้องมี 3-30 ตัวอักษร และใช้ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง')
  }

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  res.json({ data: { username, available: !user } })
}))

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  const user = await prisma.user.findUnique({ where: { id: auth.userId } })
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้')
  res.json({ data: serializeUser(user, true) })
}))

router.get('/users', requireAuth, asyncHandler(async (req, res) => {
  const input = parse(paginationSchema, req.query)
  const skip = (input.page - 1) * input.limit
  const auth = (req as AuthenticatedRequest).auth!
  const search = input.q
    ? {
        OR: [
          { username: { contains: input.q, mode: 'insensitive' as const } },
          { email: { contains: input.q, mode: 'insensitive' as const } },
          { firstName: { contains: input.q, mode: 'insensitive' as const } },
          { lastName: { contains: input.q, mode: 'insensitive' as const } },
        ],
      }
    : undefined
  const where = {
    ...(search ?? {}),
    ...(input.role ? { role: input.role } : {}),
  }

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: input.limit }),
    prisma.user.count({ where }),
  ])

  res.json({
    data: users.map((user) => serializeUser(user, auth.role === UserRole.ADMIN)),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  })
}))

router.get('/users/:id', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  const id = readStringParam(req.params.id, 'user id')
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้')

  const includePrivate = auth.role === UserRole.ADMIN || auth.userId === user.id
  res.json({ data: serializeUser(user, includePrivate) })
}))

router.put('/users/:id', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  const input = parse(updateUserSchema, req.body)
  const id = readStringParam(req.params.id, 'user id')
  const isAdmin = auth.role === UserRole.ADMIN

  if (auth.userId !== id && !isAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'แก้ไขได้เฉพาะข้อมูลของตัวเอง')
  }
  if (input.role !== undefined && !isAdmin) {
    throw new AppError(403, 'FORBIDDEN', 'เฉพาะ admin เท่านั้นที่เปลี่ยน role ได้')
  }
  if (Object.keys(input).length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'ต้องส่งข้อมูลอย่างน้อย 1 ฟิลด์')
  }

  const current = await prisma.user.findUnique({ where: { id } })
  if (!current) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้')

  if (input.username || input.email) {
    const duplicate = await prisma.user.findFirst({
      where: {
        id: { not: id },
        OR: [
          ...(input.username ? [{ username: input.username }] : []),
          ...(input.email ? [{ email: input.email }] : []),
        ],
      },
      select: { username: true, email: true },
    })
    if (duplicate) throw new AppError(409, 'DUPLICATE_RESOURCE', 'username หรือ email ถูกใช้งานแล้ว')
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.username === undefined ? {} : { username: input.username }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
      ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.role === undefined ? {} : { role: input.role }),
    },
  })

  res.json({ data: serializeUser(user, true) })
}))

router.delete('/users/:id', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  const id = readStringParam(req.params.id, 'user id')
  if (auth.userId !== id && auth.role !== UserRole.ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'ลบได้เฉพาะข้อมูลของตัวเอง หรือใช้สิทธิ์ admin')
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้')

  await prisma.user.delete({ where: { id } })
  res.json({ data: { message: 'ลบผู้ใช้สำเร็จ' } })
}))

export default router
