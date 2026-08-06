// Static display metadata. Live branches, rooms and add-ons are loaded from the API.

export const branches = [
  { id: 'siam', name: 'สาขาสยาม', area: 'สยามสแควร์, กรุงเทพฯ' },
  { id: 'thonglor', name: 'สาขาทองหล่อ', area: 'ทองหล่อ, กรุงเทพฯ' },
  { id: 'central-world', name: 'สาขาเซ็นทรัลเวิลด์', area: 'ราชประสงค์, กรุงเทพฯ' },
]

export const roomTypes = [
  { id: 'small', label: 'ห้องเล็ก (2-4 คน)', pricePerHr: 250 },
  { id: 'medium', label: 'ห้องกลาง (5-8 คน)', pricePerHr: 450 },
  { id: 'large', label: 'ห้องใหญ่ (9-15 คน)', pricePerHr: 750 },
  { id: 'vip', label: 'ห้อง VIP (พร้อมบาร์)', pricePerHr: 1200 },
]

export const addOnServices = [
  { id: 'snack', name: 'ชุดขนม & เครื่องดื่ม', price: 199, icon: '🍿' },
  { id: 'birthday', name: 'แพ็กเกจวันเกิด (บอลลูน+เค้ก)', price: 590, icon: '🎂' },
  { id: 'mic-upgrade', name: 'อัปเกรดไมค์ไร้สายคู่', price: 150, icon: '🎤' },
  { id: 'karaoke-book', name: 'สมุดเพลงฉบับพิเศษ', price: 0, icon: '📖' },
  { id: 'photo', name: 'บริการถ่ายภาพปาร์ตี้', price: 350, icon: '📸' },
]

export const timeSlots = [
  '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00',
]
