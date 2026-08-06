import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBooking } from '../context/BookingContext'

export default function CheckIn() {
  const { state, checkInBooking } = useBooking()
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const scan = async () => {
    if (!state.booking?.id) {
      setError('ไม่พบ booking ในหน้านี้ กรุณากลับไปยืนยันการจองก่อน')
      return
    }

    setScanning(true)
    setError('')
    try {
      await checkInBooking(state.booking.id)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setScanning(false)
    }
  }

  return (
    <section style={{ textAlign: 'center' }}>
      <p className="eyebrow">ระยะที่ 9 · เช็คอินที่ร้าน</p>
      <h1 className="page-title">เช็คอินการจอง</h1>
      <p className="page-sub" style={{ margin: '0 auto 24px' }}>กดปุ่มเพื่อส่งคำขอเช็คอินไปยัง REST API หลังพนักงานตรวจสอบ QR แล้ว</p>

      <div className="panel" style={{ maxWidth: 320, margin: '0 auto', padding: 32 }}>
        <div
          style={{
            width: 180, height: 180, margin: '0 auto 16px', borderRadius: 16,
            border: `2px dashed ${state.checkedIn ? 'var(--neon-cyan)' : 'var(--line)'}`,
            display: 'grid', placeItems: 'center', fontSize: 42,
          }}
        >
          {scanning ? '📡' : state.checkedIn ? '✅' : '📷'}
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>
          {state.checkedIn ? `เช็คอินสำเร็จ! ห้อง ${state.room?.name} พร้อมใช้งาน` : 'กดปุ่มเพื่อเช็คอินการจองของคุณ'}
        </p>
        {error && <p style={{ color: 'var(--status-occupied)', fontSize: 13 }}>{error}</p>}
        {!state.checkedIn && (
          <button className="btn-primary" onClick={scan} disabled={scanning}>
            {scanning ? 'กำลังเช็คอิน...' : 'เช็คอินการจอง'}
          </button>
        )}
        {state.checkedIn && (
          <button className="btn-primary" onClick={() => navigate('/review')}>
            จบการใช้งาน → ให้รีวิว
          </button>
        )}
      </div>
    </section>
  )
}

