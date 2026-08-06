import { z } from 'zod'
import { AppError } from './app-error'

export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'ข้อมูลไม่ถูกต้อง',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    )
  }
  return result.data
}

export function readStringParam(value: string | string[] | undefined, field = 'parameter'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', `${field} ไม่ถูกต้อง`)
  }
  return value
}
