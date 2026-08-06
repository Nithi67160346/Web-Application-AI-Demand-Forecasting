import { AppError } from './app-error'

export const TIME_SLOTS = [
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
]

export function timeToMinutes(value: string): number {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value)
  if (!match) throw new AppError(422, 'VALIDATION_ERROR', 'เวลาไม่ถูกต้อง ใช้รูปแบบ HH:mm')
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function dateOnlyToUtc(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'วันที่ไม่ถูกต้อง ใช้รูปแบบ YYYY-MM-DD')
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new AppError(422, 'VALIDATION_ERROR', 'วันที่ไม่มีอยู่จริง')
  }
  return date
}

export function isPastDate(date: Date): boolean {
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return date.getTime() < todayUtc
}

export function intervalsOverlap(
  startA: number,
  durationA: number,
  startB: number,
  durationB: number,
): boolean {
  const endA = startA + durationA * 60
  const endB = startB + durationB * 60
  return startA < endB && startB < endA
}

