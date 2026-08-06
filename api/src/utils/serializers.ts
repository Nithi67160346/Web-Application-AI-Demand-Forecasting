import { Prisma, User } from '@prisma/client'

type UserRecord = Pick<
  User,
  'id' | 'username' | 'email' | 'firstName' | 'lastName' | 'phone' | 'role' | 'createdAt' | 'updatedAt'
>

export function serializeUser(user: UserRecord, includePrivate = false) {
  const result: Record<string, unknown> = {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }

  if (includePrivate) {
    result.email = user.email
    result.phone = user.phone
  }

  return result
}

export const bookingInclude = {
  branch: true,
  room: true,
  addOns: { include: { addOn: true } },
  review: true,
} satisfies Prisma.BookingInclude

export type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>

export function serializeBooking(booking: BookingWithRelations) {
  return {
    id: booking.id,
    code: booking.code,
    bookingDate: booking.bookingDate.toISOString().slice(0, 10),
    startTime: booking.startTime,
    durationHours: booking.durationHours,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    totalAmount: booking.totalAmount,
    checkedInAt: booking.checkedInAt?.toISOString() ?? null,
    branch: {
      id: booking.branch.id,
      name: booking.branch.name,
      slug: booking.branch.slug,
      area: booking.branch.area,
      address: booking.branch.address,
    },
    room: {
      id: booking.room.id,
      code: booking.room.code,
      name: booking.room.name,
      type: booking.room.type,
      capacity: booking.room.capacity,
      pricePerHour: booking.room.pricePerHour,
    },
    addOns: booking.addOns.map((row) => ({
      id: row.addOn.id,
      name: row.addOn.name,
      icon: row.addOn.icon,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      totalPrice: row.unitPrice * row.quantity,
    })),
    review: booking.review
      ? {
          id: booking.review.id,
          rating: booking.review.rating,
          comment: booking.review.comment,
          createdAt: booking.review.createdAt.toISOString(),
        }
      : null,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  }
}

