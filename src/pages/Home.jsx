import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <section>
      <p className="eyebrow">ระยะที่ 1 · รู้จัก / ค้นหาข้อมูล</p>
      <h1 className="page-title">จองห้องคาราโอเกะ ที่ใช่ ในไม่กี่แตะ</h1>
      <p className="page-sub">
        ดูห้องว่างแบบ 3D แบบเรียลไทม์ ก่อนเดินทางไปถึงหน้าร้าน
        เห็นชัดว่าห้องไหนว่าง ห้องไหนไม่ว่าง ด้วยไฟสถานะสีเขียว/แดง
        แรงบันดาลใจจากรีวิวเพื่อนใน Social Media
      </p>

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
