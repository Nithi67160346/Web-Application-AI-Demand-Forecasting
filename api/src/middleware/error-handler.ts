import { ErrorRequestHandler, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { AppError } from '../utils/app-error'
import { env } from '../config'

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `ไม่พบเส้นทาง ${req.method} ${req.path}`))
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    })
    return
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'ข้อมูลซ้ำกับข้อมูลที่มีอยู่แล้ว',
        },
      })
      return
    }

    if (error.code === 'P2025') {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'ไม่พบข้อมูลที่ต้องการ',
        },
      })
      return
    }
  }

  console.error(error)
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: env.nodeEnv === 'production' ? 'เกิดข้อผิดพลาดภายในระบบ' : error instanceof Error ? error.message : 'เกิดข้อผิดพลาด',
    },
  })
}

