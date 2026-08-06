import { PrismaClient, RoomStatus, RoomType, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const branches = [
  { id: 'siam', slug: 'siam', name: 'สาขาสยาม', area: 'สยามสแควร์, กรุงเทพฯ', address: 'สยามสแควร์ กรุงเทพฯ' },
  { id: 'thonglor', slug: 'thonglor', name: 'สาขาทองหล่อ', area: 'ทองหล่อ, กรุงเทพฯ', address: 'สุขุมวิท 55 กรุงเทพฯ' },
  { id: 'central-world', slug: 'central-world', name: 'สาขาเซ็นทรัลเวิลด์', area: 'ราชประสงค์, กรุงเทพฯ', address: 'เซ็นทรัลเวิลด์ กรุงเทพฯ' },
]

const roomTypes: Array<{
  type: RoomType
  capacity: number
  pricePerHour: number
}> = [
  { type: RoomType.SMALL, capacity: 4, pricePerHour: 250 },
  { type: RoomType.MEDIUM, capacity: 8, pricePerHour: 450 },
  { type: RoomType.LARGE, capacity: 15, pricePerHour: 750 },
  { type: RoomType.VIP, capacity: 20, pricePerHour: 1200 },
]

const typeCycle = [RoomType.SMALL, RoomType.SMALL, RoomType.MEDIUM, RoomType.MEDIUM, RoomType.LARGE, RoomType.VIP]

const addOns = [
  { id: 'snack', name: 'ชุดขนมและเครื่องดื่ม', price: 199, icon: '🍿' },
  { id: 'birthday', name: 'แพ็กเกจวันเกิด (บอลลูน+เค้ก)', price: 590, icon: '🎂' },
  { id: 'mic-upgrade', name: 'อัปเกรดไมค์ไร้สายคู่', price: 150, icon: '🎤' },
  { id: 'karaoke-book', name: 'สมุดเพลงฉบับพิเศษ', price: 0, icon: '📖' },
  { id: 'photo', name: 'บริการถ่ายภาพปาร์ตี้', price: 350, icon: '📸' },
]

async function seed(): Promise<void> {
  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      create: branch,
      update: branch,
    })

    for (let index = 1; index <= 12; index += 1) {
      const type = typeCycle[(index - 1) % typeCycle.length]
      const typeInfo = roomTypes.find((item) => item.type === type)!
      const roomId = `${branch.slug}-r${100 + index}`
      await prisma.room.upsert({
        where: { id: roomId },
        create: {
          id: roomId,
          code: `${branch.slug.toUpperCase()}-R${100 + index}`,
          name: `ห้อง ${100 + index}`,
          type,
          capacity: typeInfo.capacity,
          pricePerHour: typeInfo.pricePerHour,
          gridColumn: (index - 1) % 4,
          gridRow: Math.floor((index - 1) / 4),
          status: RoomStatus.AVAILABLE,
          branchId: branch.id,
        },
        update: {
          name: `ห้อง ${100 + index}`,
          type,
          capacity: typeInfo.capacity,
          pricePerHour: typeInfo.pricePerHour,
          gridColumn: (index - 1) % 4,
          gridRow: Math.floor((index - 1) / 4),
          branchId: branch.id,
        },
      })
    }
  }

  for (const addOn of addOns) {
    await prisma.addOn.upsert({
      where: { id: addOn.id },
      create: addOn,
      update: addOn,
    })
  }

  const adminPasswordHash = await bcrypt.hash('Admin12345!', 10)
  const demoPasswordHash = await bcrypt.hash('Demo12345!', 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      firstName: 'System',
      lastName: 'Admin',
      role: UserRole.ADMIN,
    },
    update: { email: 'admin@example.com', role: UserRole.ADMIN },
  })
  await prisma.user.upsert({
    where: { username: 'demo_user' },
    create: {
      username: 'demo_user',
      email: 'demo@example.com',
      passwordHash: demoPasswordHash,
      firstName: 'Demo',
      lastName: 'User',
      role: UserRole.USER,
    },
    update: { email: 'demo@example.com', role: UserRole.USER },
  })

  console.log('Seed completed: branches, rooms, add-ons, admin and demo users')
}

seed()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

