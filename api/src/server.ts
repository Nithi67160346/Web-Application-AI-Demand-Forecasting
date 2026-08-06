import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { prisma } from './lib/prisma'
import { env } from './config'
import authRoutes from './routes/auth'
import bookingRoutes from './routes/bookings'
import catalogRoutes from './routes/catalog'
import userRoutes from './routes/users'
import { errorHandler, notFoundHandler } from './middleware/error-handler'
import { asyncHandler } from './utils/async-handler'

const app = express()

const corsOrigin = env.corsOrigins.includes('*') ? true : env.corsOrigins
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: corsOrigin }))
app.use(express.json({ limit: '1mb' }))

app.get('/health', asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ data: { status: 'ok', service: 'karaoke-booking-api' } })
}))

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1', userRoutes)
app.use('/api/v1', catalogRoutes)
app.use('/api/v1', bookingRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

const server = app.listen(env.port, () => {
  console.log(`Karaoke Booking API listening on port ${env.port}`)
})

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('SIGTERM', () => { void shutdown('SIGTERM') })

