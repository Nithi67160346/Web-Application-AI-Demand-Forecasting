import { Router } from 'express'
import { BookingStatus } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { asyncHandler } from '../utils/async-handler'
import { parse, readStringParam } from '../utils/validate'
import { dateOnlyToUtc, intervalsOverlap, isPastDate, timeToMinutes, TIME_SLOTS } from '../utils/date-time'

const router = Router()

const availabilityQuerySchema = z.object({
  date: z.string().optional(),
  startTime: z.string().optional(),
  durationHours: z.coerce.number().int().min(1).max(8).default(2),
})

function serializeRoom(room: {
  id: string
  code: string
  name: string
  type: string
  capacity: number
  pricePerHour: number
  gridColumn: number
  gridRow: number
  status: string
  branchId: string
}, available: boolean) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    type: room.type,
    capacity: room.capacity,
    pricePerHour: room.pricePerHour,
    gridColumn: room.gridColumn,
    gridRow: room.gridRow,
    status: room.status,
    available,
    branchId: room.branchId,
  }
}

async function listRooms(branchId: string | undefined, query: unknown) {
  const input = parse(availabilityQuerySchema, query)
  const rooms = await prisma.room.findMany({
    where: branchId ? { branchId } : undefined,
    orderBy: [{ branchId: 'asc' }, { gridRow: 'asc' }, { gridColumn: 'asc' }],
  })

  if (!input.date || !input.startTime || rooms.length === 0) {
    return rooms.map((room) => serializeRoom(room, room.status === 'AVAILABLE'))
  }

  const date = dateOnlyToUtc(input.date)
  if (isPastDate(date)) {
    return rooms.map((room) => serializeRoom(room, false))
  }
  const start = timeToMinutes(input.startTime)
  const bookings = await prisma.booking.findMany({
    where: {
      roomId: { in: rooms.map((room) => room.id) },
      bookingDate: date,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    },
    select: { roomId: true, startTime: true, durationHours: true },
  })

  return rooms.map((room) => {
    const occupied = bookings.some((booking) => (
      booking.roomId === room.id
      && intervalsOverlap(start, input.durationHours, timeToMinutes(booking.startTime), booking.durationHours)
    ))
    return serializeRoom(room, room.status === 'AVAILABLE' && !occupied)
  })
}

router.get('/branches', asyncHandler(async (_req, res) => {
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { rooms: true } } },
  })
  res.json({
    data: branches.map((branch) => ({
      id: branch.id,
      slug: branch.slug,
      name: branch.name,
      area: branch.area,
      address: branch.address,
      roomCount: branch._count.rooms,
    })),
  })
}))

router.get('/branches/:branchId/rooms', asyncHandler(async (req, res) => {
  const branchId = readStringParam(req.params.branchId, 'branch id')
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, isActive: true },
    select: { id: true },
  })
  if (!branch) {
    res.status(404).json({ error: { code: 'BRANCH_NOT_FOUND', message: 'ไม่พบสาขา' } })
    return
  }

  const rooms = await listRooms(branch.id, req.query)
  res.json({ data: rooms, meta: { timeSlots: TIME_SLOTS } })
}))

router.get('/rooms', asyncHandler(async (req, res) => {
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined
  const rooms = await listRooms(branchId, req.query)
  res.json({ data: rooms, meta: { timeSlots: TIME_SLOTS } })
}))

router.get('/add-ons', asyncHandler(async (_req, res) => {
  const addOns = await prisma.addOn.findMany({ where: { isActive: true }, orderBy: { id: 'asc' } })
  res.json({
    data: addOns.map((addOn) => ({
      id: addOn.id,
      name: addOn.name,
      price: addOn.price,
      icon: addOn.icon,
    })),
  })
}))

export default router
