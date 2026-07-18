// Mock data layer.
// In production, replace these functions with real API calls
// (e.g. fetch('/api/branches'), fetch('/api/rooms?branch=...')).

export const branches = [
  { id: 'b1', name: 'สาขาสยาม', area: 'สยามสแควร์, กรุงเทพฯ' },
  { id: 'b2', name: 'สาขาทองหล่อ', area: 'ทองหล่อ, กรุงเทพฯ' },
  { id: 'b3', name: 'สาขาเซ็นทรัลเวิลด์', area: 'ราชประสงค์, กรุงเทพฯ' },
]

export const roomTypes = [
  { id: 'small', label: 'ห้องเล็ก (2-4 คน)', pricePerHr: 250 },
  { id: 'medium', label: 'ห้องกลาง (5-8 คน)', pricePerHr: 450 },
  { id: 'large', label: 'ห้องใหญ่ (9-15 คน)', pricePerHr: 750 },
  { id: 'vip', label: 'ห้อง VIP (พร้อมบาร์)', pricePerHr: 1200 },
]

// 12 rooms laid out on a 4x3 grid for the 3D floor plan.
// status: 'available' | 'occupied' | 'selected'
export const generateRooms = (seed = 0) => {
  const layout = []
  const cols = 4
  const rows = 3
  const typeCycle = ['small', 'small', 'medium', 'medium', 'large', 'vip']
  let idx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      idx++
      const type = typeCycle[(idx + seed) % typeCycle.length]
      const occupied = (idx * 7 + seed * 3) % 5 === 0 || (idx + seed) % 4 === 0
      layout.push({
        id: `R${100 + idx}`,
        name: `ห้อง ${100 + idx}`,
        col: c,
        row: r,
        type,
        status: occupied ? 'occupied' : 'available',
      })
    }
  }
  return layout
}

export const addOnServices = [
  { id: 'snack', name: 'ชุดขนม & เครื่องดื่ม', price: 199, icon: '🍿' },
  { id: 'birthday', name: 'แพ็กเกจวันเกิด (บอลลูน+เค้ก)', price: 590, icon: '🎂' },
  { id: 'micUpgrade', name: 'อัปเกรดไมค์ไร้สายคู่', price: 150, icon: '🎤' },
  { id: 'karaoke_book', name: 'สมุดเพลงฉบับพิเศษ', price: 0, icon: '📖' },
  { id: 'photo', name: 'บริการถ่ายภาพปาร์ตี้', price: 350, icon: '📸' },
]

export const timeSlots = [
  '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00',
]
