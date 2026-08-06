import { useNavigate } from 'react-router-dom'
import { useBooking } from '../context/BookingContext'

export default function Confirmation() {
  const { state } = useBooking()
  const navigate = useNavigate()

  if (!state.bookingCode) {
    return (
      <section>
        <p className="page-sub">ยังไม่มีการจองที่ยืนยันแล้ว</p>
        <button className="btn-primary" onClick={() => navigate('/')}>กลับหน้าแรก →</button>
      </section>
    )
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${state.bookingCode}`

  return (
    <section style={{ textAlign: 'center' }}>
      <p className="eyebrow">ระยะที่ 7 · ยืนยันการจอง</p>
      <h1 className="page-title">จองสำเร็จ! 🎉</h1>
      <p className="page-sub" style={{ margin: '0 auto 28px' }}>
        แสดง QR Code นี้ที่หน้าร้านเพื่อเช็คอิน หรือรอรับ SMS/LINE/Email ยืนยันก่อนถึงวันจอง
      </p>

      <div className="panel" style={{ display: 'inline-block', padding: 28 }}>
        <img src={qrUrl} alt="QR สำหรับเช็คอิน" width={180} height={180} style={{ borderRadius: 10, background: '#fff', padding: 8 }} />
        <p style={{ fontFamily: 'var(--font-mono)', marginTop: 14, fontSize: 15, letterSpacing: 1 }}>{state.bookingCode}</p>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          {state.branch?.name} · {state.room?.name} · {state.date} {state.time}
        </p>
      </div>

      <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button className="btn-ghost" onClick={() => navigate('/notifications')}>ดูการแจ้งเตือน →</button>
        <button className="btn-primary" onClick={() => navigate('/checkin')}>ไปเช็คอิน →</button>
      </div>
    </section>
  )
}
