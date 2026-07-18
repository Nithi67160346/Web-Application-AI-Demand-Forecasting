import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBooking } from '../context/BookingContext'

export default function CheckIn() {
  const { state, update } = useBooking()
  const [scanning, setScanning] = useState(false)
  const navigate = useNavigate()

  const scan = () => {
    setScanning(true)
    // Mock camera / QR-scan SDK call (e.g. html5-qrcode).
    setTimeout(() => {
      update({ checkedIn: true })
      setScanning(false)
    }, 1200)
  }

  return (
    <section style={{ textAlign: 'center' }}>
      <p className="eyebrow">ระยะที่ 9 · เช็คอินที่ร้าน</p>
      <h1 className="page-title">สแกน QR Code หน้าร้าน</h1>
      <p className="page-sub" style={{ margin: '0 auto 24px' }}>พนักงานหรือคีออสก์จะสแกนโค้ดของคุณเพื่อเปิดประตูห้องอัตโนมัติ</p>

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
          {state.checkedIn ? `เช็คอินสำเร็จ! ห้อง ${state.room?.name} พร้อมใช้งาน` : 'กดปุ่มเพื่อจำลองการสแกน QR'}
        </p>
        {!state.checkedIn && (
          <button className="btn-primary" onClick={scan} disabled={scanning}>
            {scanning ? 'กำลังสแกน...' : 'สแกน QR Code'}
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
