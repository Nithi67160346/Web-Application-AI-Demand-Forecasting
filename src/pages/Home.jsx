import { Link } from 'react-router-dom'
import { useBooking } from '../context/BookingContext'

export default function Home() {
  const { state } = useBooking()

  return (
    <section>
      <p className="eyebrow">ระยะที่ 1 · รู้จัก / ค้นหาข้อมูล</p>
      <h1 className="page-title">จองห้องคาราโอเกะ ที่ใช่ ในไม่กี่แตะ</h1>
      <p className="page-sub">
        ดูห้องว่างแบบ 3D แบบเรียลไทม์ ก่อนเดินทางไปถึงหน้าร้าน
        เห็นชัดว่าห้องไหนว่าง ห้องไหนไม่ว่าง ด้วยไฟสถานะสีเขียว/แดง
        แรงบันดาลใจจากรีวิวเพื่อนใน Social Media
      </p>

      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>{state.user ? 'MEMBER MODE' : 'GUEST MODE'}</p>
          <p style={{ margin: '6px 0 0', color: 'var(--text-dim)', fontSize: 14 }}>
            {state.user
              ? `สวัสดี ${state.user.firstName} · พร้อมยืนยันการจองแล้ว`
              : 'เลือกดูสาขา ห้องว่าง และบริการเสริมได้ทันที โดยยังไม่ต้องสมัครสมาชิก'}
          </p>
        </div>
        {!state.user && <Link to="/auth" className="btn-ghost" style={{ textDecoration: 'none' }}>เข้าสู่ระบบเมื่อพร้อม →</Link>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 32 }}>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>🔥 กำลังฮิต</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>ห้อง VIP พร้อมบาร์ จองล่วงหน้าก่อนใคร</p>
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>⭐ รีวิว 4.8/5</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>จากผู้ใช้กว่า 12,000 คน</p>
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>📍 3 สาขา</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>สยาม, ทองหล่อ, เซ็นทรัลเวิลด์</p>
        </div>
      </div>

      <Link to="/search" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
        เริ่มค้นหาห้อง →
      </Link>
    </section>
  )
}
