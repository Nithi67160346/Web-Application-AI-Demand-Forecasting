import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { roomTypes } from '../data/rooms'
import { useBooking } from '../context/BookingContext'

const today = new Date().toISOString().slice(0, 10)

export default function SearchRooms() {
  const { state, branches, catalogLoading, catalogError, update } = useBooking()
  const navigate = useNavigate()
  const [branch, setBranch] = useState(state.branch?.id || '')
  const [type, setType] = useState(state.roomType || '')
  const [date, setDate] = useState(state.date || today)
  const [partySize, setPartySize] = useState(state.partySize || 4)

  useEffect(() => {
    if (!branch && branches.length > 0) setBranch(branches[0].id)
  }, [branch, branches])

  const goNext = () => {
    const selected = branches.find((item) => item.id === branch)
    if (!selected || !date) return

    update({
      branch: selected,
      date,
      roomType: type,
      partySize: Number(partySize),
      room: null,
      time: '',
      booking: null,
      paid: false,
      bookingCode: null,
      checkedIn: false,
      review: null,
    })
    navigate('/rooms')
  }

  return (
    <section>
      <p className="eyebrow">ระยะที่ 2 · ค้นหา ห้องคาราโอเกะ</p>
      <h1 className="page-title">เลือกสาขาและประเภทห้อง</h1>
      <p className="page-sub">กรองตามสาขา วันที่ เวลา และจำนวนคน เพื่อดูห้องที่เหมาะกับกลุ่มของคุณ</p>

      {catalogError && <p className="page-sub" style={{ color: 'var(--status-occupied)' }}>{catalogError}</p>}

      <div className="panel" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          สาขา
          <select value={branch} onChange={(e) => setBranch(e.target.value)} style={selectStyle} disabled={catalogLoading || branches.length === 0}>
            {branches.length === 0 && <option value="">กำลังโหลดสาขา...</option>}
            {branches.map((item) => (
              <option key={item.id} value={item.id}>{item.name} — {item.area}</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          วันที่จอง
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} style={selectStyle} />
        </label>

        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          ประเภทห้อง (ไม่บังคับ)
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            <option value="">ทั้งหมด</option>
            {roomTypes.map((roomType) => (
              <option key={roomType.id} value={roomType.id}>{roomType.label} — เริ่ม {roomType.pricePerHr}฿/ชม.</option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          จำนวนคน
          <input type="number" min={1} max={20} value={partySize} onChange={(e) => setPartySize(e.target.value)} style={selectStyle} />
        </label>
      </div>

      <button className="btn-primary" style={{ marginTop: 24 }} onClick={goNext} disabled={catalogLoading || !branch || !date}>
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
