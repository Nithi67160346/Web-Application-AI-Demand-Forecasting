import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { BookingStatus, PaymentStatus, Prisma, RoomStatus, UserRole } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthenticatedRequest } from '../middleware/auth'
import { AppError } from '../utils/app-error'
import { asyncHandler } from '../utils/async-handler'
import { parse, readStringParam } from '../utils/validate'
import { bookingInclude, serializeBooking, BookingWithRelations } from '../utils/serializers'
import { dateOnlyToUtc, intervalsOverlap, isPastDate, timeToMinutes, TIME_SLOTS } from '../utils/date-time'

const router = Router()

const createBookingSchema = z.object({
  branchId: z.string().trim().min(1),
  roomId: z.string().trim().min(1),
  bookingDate: z.string().trim(),
  startTime: z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'ใช้รูปแบบเวลา HH:mm'),
  durationHours: z.coerce.number().int().min(1).max(8).default(2),
  addOns: z.array(z.object({
    id: z.string().trim().min(1),
    quantity: z.coerce.number().int().min(1).max(10),
  })).max(20).default([]),
})

const listBookingsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.nativeEnum(BookingStatus).optional(),
  userId: z.string().trim().optional(),
})

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).nullable().optional(),
})

function bookingCode(): string {
  return `KTV-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
}

function ensureNoDuplicateAddOns(addOns: Array<{ id: string; quantity: number }>): void {
  const ids = addOns.map((item) => item.id)
  if (new Set(ids).size !== ids.length) {
    throw new AppError(422, 'VALIDATION_ERROR', 'ห้ามส่งบริการเสริม id ซ้ำกันในรายการเดียว')
  }
}

async function getBookingForUser(id: string, auth: NonNullable<AuthenticatedRequest['auth']>): Promise<BookingWithRelations> {
  const booking = await prisma.booking.findUnique({ where: { id }, include: bookingInclude })
  if (!booking) throw new AppError(404, 'BOOKING_NOT_FOUND', 'ไม่พบข้อมูลการจอง')
  if (booking.userId !== auth.userId && auth.role !== UserRole.ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูข้อมูลการจองนี้')
  }
  return booking
}

router.get('/bookings', requireAuth, asyncHandler(async (req, res) => {
  const input = parse(listBookingsSchema, req.query)
  const auth = (req as AuthenticatedRequest).auth!
  if (input.userId && auth.role !== UserRole.ADMIN) {
    throw new AppError(403, 'FORBIDDEN', 'เฉพาะ admin เท่านั้นที่ค้นหาการจองของ user อื่นได้')
  }

  const where: Prisma.BookingWhereInput = {
    userId: input.userId && auth.role === UserRole.ADMIN ? input.userId : auth.userId,
    ...(input.status ? { status: input.status } : {}),
  }
  const skip = (input.page - 1) * input.limit
  const [bookings, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: [{ bookingDate: 'desc' }, { startTime: 'desc' }],
      skip,
      take: input.limit,
    }),
    prisma.booking.count({ where }),
  ])

  res.json({
    data: bookings.map(serializeBooking),
    meta: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  })
}))

router.post('/bookings', requireAuth, asyncHandler(async (req, res) => {
  const input = parse(createBookingSchema, req.body)
  ensureNoDuplicateAddOns(input.addOns)

  const bookingDate = dateOnlyToUtc(input.bookingDate)
  if (isPastDate(bookingDate)) {
    throw new AppError(422, 'INVALID_BOOKING_DATE', 'ไม่สามารถจองวันที่ผ่านมาแล้วได้')
  }
  if (!TIME_SLOTS.includes(input.startTime)) {
    throw new AppError(422, 'INVALID_START_TIME', `เวลาเริ่มต้องอยู่ในช่วง ${TIME_SLOTS[0]}-${TIME_SLOTS[TIME_SLOTS.length - 1]}`)
  }
  const start = timeToMinutes(input.startTime)
  if (start + input.durationHours * 60 > 24 * 60) {
    throw new AppError(422, 'INVALID_DURATION', 'ระยะเวลาจองเกินเวลาปิดให้บริการ')
  }

  const auth = (req as AuthenticatedRequest).auth!
  const booking = await prisma.$transaction(async (tx) => {
    const room = await tx.room.findFirst({
      where: {
        id: input.roomId,
        branchId: input.branchId,
        status: RoomStatus.AVAILABLE,
      },
      include: { branch: true },
    })
    if (!room || !room.branch.isActive) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'ไม่พบห้องหรือห้องไม่พร้อมให้บริการ')
    }

    const existingBookings = await tx.booking.findMany({
      where: {
        roomId: input.roomId,
        bookingDate,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      },
      select: { startTime: true, durationHours: true },
    })
    if (existingBookings.some((item) => (
      intervalsOverlap(start, input.durationHours, timeToMinutes(item.startTime), item.durationHours)
    ))) {
      throw new AppError(409, 'ROOM_NOT_AVAILABLE', 'ห้องนี้ถูกจองในช่วงเวลาที่เลือกแล้ว')
    }

    const addOnIds = input.addOns.map((item) => item.id)
    const addOns = await tx.addOn.findMany({
      where: { id: { in: addOnIds }, isActive: true },
    })
    if (addOns.length !== addOnIds.length) {
      throw new AppError(404, 'ADD_ON_NOT_FOUND', 'ไม่พบบริการเสริมบางรายการ หรือรายการนั้นปิดให้บริการแล้ว')
    }

    const addOnById = new Map(addOns.map((item) => [item.id, item]))
    const addOnTotal = input.addOns.reduce((sum, item) => {
      return sum + (addOnById.get(item.id)?.price ?? 0) * item.quantity
    }, 0)
    const totalAmount = room.pricePerHour * input.durationHours + addOnTotal

    return tx.booking.create({
      data: {
        code: bookingCode(),
        userId: auth.userId,
        branchId: input.branchId,
        roomId: input.roomId,
        bookingDate,
        startTime: input.startTime,
        durationHours: input.durationHours,
        totalAmount,
        addOns: {
          create: input.addOns.map((item) => ({
            addOn: { connect: { id: item.id } },
            quantity: item.quantity,
            unitPrice: addOnById.get(item.id)!.price,
          })),
        },
      },
      include: bookingInclude,
    })
  })

  res.status(201).json({ data: serializeBooking(booking) })
}))

router.get('/bookings/:id', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  const booking = await getBookingForUser(readStringParam(req.params.id, 'booking id'), auth)
  res.json({ data: serializeBooking(booking) })
}))

router.post('/bookings/:id/pay', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  const booking = await getBookingForUser(readStringParam(req.params.id, 'booking id'), auth)
  if (booking.status === BookingStatus.CANCELLED) {
    throw new AppError(409, 'BOOKING_CANCELLED', 'ไม่สามารถชำระเงินให้การจองที่ยกเลิกแล้วได้')
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: PaymentStatus.PAID, status: BookingStatus.CONFIRMED },
    include: bookingInclude,
  })
  res.json({ data: serializeBooking(updated) })
}))

router.post('/bookings/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  const booking = await getBookingForUser(readStringParam(req.params.id, 'booking id'), auth)
  if (booking.status === BookingStatus.COMPLETED) {
    throw new AppError(409, 'BOOKING_COMPLETED', 'ไม่สามารถยกเลิกการจองที่ใช้งานเสร็จแล้วได้')
  }
  if (booking.status === BookingStatus.CANCELLED) {
    res.json({ data: serializeBooking(booking) })
    return
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: BookingStatus.CANCELLED,
      paymentStatus: booking.paymentStatus === PaymentStatus.PAID ? PaymentStatus.REFUNDED : PaymentStatus.UNPAID,
    },
    include: bookingInclude,
  })
  res.json({ data: serializeBooking(updated) })
}))

router.post('/bookings/:id/check-in', requireAuth, asyncHandler(async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!
  const booking = await getBookingForUser(readStringParam(req.params.id, 'booking id'), auth)
  if (booking.status !== BookingStatus.CONFIRMED || booking.paymentStatus !== PaymentStatus.PAID) {
    throw new AppError(409, 'BOOKING_NOT_READY', 'การจองต้องชำระเงินและอยู่ในสถานะ confirmed ก่อนเช็คอิน')
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: BookingStatus.COMPLETED, checkedInAt: new Date() },
    include: bookingInclude,
  })
  res.json({ data: serializeBooking(updated) })
}))

router.post('/bookings/:id/review', requireAuth, asyncHandler(async (req, res) => {
  const input = parse(reviewSchema, req.body)
  const auth = (req as AuthenticatedRequest).auth!
  const booking = await getBookingForUser(readStringParam(req.params.id, 'booking id'), auth)
  if (booking.userId !== auth.userId) {
    throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้จองเท่านั้นที่ให้รีวิวได้')
  }
  if (booking.status !== BookingStatus.COMPLETED) {
    throw new AppError(409, 'BOOKING_NOT_COMPLETED', 'ให้รีวิวได้หลังเช็คอินและจบการใช้บริการแล้ว')
  }

  await prisma.review.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      userId: auth.userId,
      rating: input.rating,
      comment: input.comment ?? null,
    },
    update: {
      rating: input.rating,
      comment: input.comment ?? null,
    },
  })
  const updated = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: bookingInclude })
  res.status(201).json({ data: serializeBooking(updated) })
}))

export default router
