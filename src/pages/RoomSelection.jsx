import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Room3D from '../components/Room3D'
import RoomLegend from '../components/RoomLegend'
import { timeSlots, roomTypes } from '../data/rooms'
import { useBooking } from '../context/BookingContext'

const today = new Date().toISOString().slice(0, 10)

export default function RoomSelection() {
  const { state, rooms, roomsLoading, roomError, loadRooms, update } = useBooking()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(state.room?.id || null)
  const [time, setTime] = useState(state.time || '')
  const date = state.date || today
  const availabilityTime = time || timeSlots[0]

  useEffect(() => {
    if (!state.branch?.id) return undefined

    let active = true
    loadRooms(state.branch.id, date, availabilityTime, 2)
      .then((nextRooms) => {
        if (!active) return
        setSelectedId((current) => nextRooms.some((room) => room.id === current && room.status === 'available') ? current : null)
      })
      .catch(() => {})

    return () => { active = false }
  }, [availabilityTime, date, loadRooms, state.branch?.id])

  const visibleRooms = rooms.filter((room) => {
    const typeMatches = !state.roomType || room.type === state.roomType
    const capacityMatches = !state.partySize || room.capacity >= state.partySize
    return typeMatches && capacityMatches
  })
  const selectedRoom = visibleRooms.find((room) => room.id === selectedId)
  const priceInfo = selectedRoom ? roomTypes.find((type) => type.id === selectedRoom.type) : null
  const canContinue = selectedRoom && time && selectedRoom.status === 'available'

  const goNext = () => {
    if (!canContinue) return
    update({ room: selectedRoom, time, date })
    navigate('/addons')
  }

  if (!state.branch) {
    return (
      <section>
        <p className="page-sub">กรุณาเลือกสาขาก่อน</p>
        <button className="btn-primary" onClick={() => navigate('/search')}>กลับไปค้นหาห้อง →</button>
      </section>
    )
  }

  return (
    <section>
      <p className="eyebrow">ระยะที่ 3 · เลือกห้อง & วันเวลา</p>
      <h1 className="page-title">
        แผนผังห้อง — {state.branch.name} (มุมมอง 3D)
      </h1>
      <p className="page-sub">
        วันที่ {date} · เลือกช่วงเวลาเพื่อให้ระบบตรวจสอบห้องว่างจากฐานข้อมูลแบบเรียลไทม์
      </p>

      {roomError && <p className="page-sub" style={{ color: 'var(--status-occupied)' }}>{roomError}</p>}
      {roomsLoading && <p className="page-sub">กำลังโหลดสถานะห้อง...</p>}

      <Room3D rooms={visibleRooms} selectedId={selectedId} onSelect={setSelectedId} />
      <RoomLegend />

      <div className="panel" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>เลือกช่วงเวลา</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {timeSlots.map((slot) => (
            <button
              key={slot}
              onClick={() => setTime(slot)}
              className="btn-ghost"
              style={{
                borderColor: time === slot ? 'var(--neon-cyan)' : undefined,
                color: time === slot ? 'var(--neon-cyan)' : undefined,
              }}
            >
              {slot}
            </button>
          ))}
        </div>

        {selectedRoom && (
          <div style={{ marginTop: 18, fontSize: 14, color: 'var(--text-dim)' }}>
            เลือกแล้ว: <strong style={{ color: 'var(--text-main)' }}>{selectedRoom.name}</strong>
            {priceInfo && <> · {priceInfo.label} · {selectedRoom.pricePerHour || priceInfo.pricePerHr}฿/ชม.</>}
          </div>
        )}
      </div>

      <button className="btn-primary" style={{ marginTop: 24 }} disabled={!canContinue || roomsLoading} onClick={goNext}>
        ไปต่อ: เพิ่มบริการเสริม →
      </button>
    </section>
  )
}

