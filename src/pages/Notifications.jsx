import { useBooking } from '../context/BookingContext'

export default function Notifications() {
  const { state } = useBooking()

  const items = [
    { channel: 'Push Notification', time: '1 ชม.ก่อนถึง', text: `เตรียมตัวเดินทาง! การจอง ${state.bookingCode || ''} เริ่มในอีก 1 ชั่วโมง` },
    { channel: 'LINE', time: '1 วันก่อนถึง', text: 'อย่าลืมการจองห้องคาราโอเกะพรุ่งนี้ของคุณนะ 🎤' },
    { channel: 'SMS', time: 'ทันทีหลังจอง', text: `ยืนยันการจอง ${state.bookingCode || 'KTV-XXXXXX'} เรียบร้อยแล้ว` },
  ]

  return (
    <section>
      <p className="eyebrow">ระยะที่ 8 · แจ้งเตือนก่อนถึงวันจอง</p>
      <h1 className="page-title">ศูนย์การแจ้งเตือน</h1>
      <p className="page-sub">ระบบส่งแจ้งเตือนอัตโนมัติผ่านหลายช่องทาง เพื่อลดการลืมวันนัด</p>

      <div className="grid">
        {items.map((n, i) => (
          <div key={i} className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{n.channel}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{n.text}</div>
            </div>
            <span className="eyebrow" style={{ whiteSpace: 'nowrap' }}>{n.time}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
