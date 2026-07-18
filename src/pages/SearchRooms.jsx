import { useNavigate } from 'react-router-dom'
import { branches, roomTypes } from '../data/rooms'
import { useBooking } from '../context/BookingContext'
import { useState } from 'react'

export default function SearchRooms() {
  const { state, update } = useBooking()
  const navigate = useNavigate()
  const [branch, setBranch] = useState(state.branch?.id || branches[0].id)
  const [type, setType] = useState('')

  const goNext = () => {
    const selected = branches.find((b) => b.id === branch)
    update({ branch: selected })
    navigate('/rooms')
  }

  return (
    <section>
      <p className="eyebrow">ระยะที่ 2 · ค้นหา ห้องคาราโอเกะ</p>
      <h1 className="page-title">เลือกสาขาและประเภทห้อง</h1>
      <p className="page-sub">กรองตามสาขา วันที่ เวลา และจำนวนคน เพื่อดูห้องที่เหมาะกับกลุ่มของคุณ</p>

      <div className="panel" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          สาขา
          <select value={branch} onChange={(e) => setBranch(e.target.value)} style={selectStyle}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name} — {b.area}</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          ประเภทห้อง (ไม่บังคับ)
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            <option value="">ทั้งหมด</option>
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.label} — เริ่ม {t.pricePerHr}฿/ชม.</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          จำนวนคน
          <input type="number" min={1} defaultValue={4} style={selectStyle} />
        </label>
      </div>

      <button className="btn-primary" style={{ marginTop: 24 }} onClick={goNext}>
        ดูห้องว่างแบบ 3D →
      </button>
    </section>
  )
}

const selectStyle = {
  display: 'block',
  width: '100%',
  marginTop: 8,
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--bg-void)',
  color: 'var(--text-main)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
}
