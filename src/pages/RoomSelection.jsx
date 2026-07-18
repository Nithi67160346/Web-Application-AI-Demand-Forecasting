import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import Room3D from '../components/Room3D'
import RoomLegend from '../components/RoomLegend'
import { timeSlots, roomTypes } from '../data/rooms'
import { useBooking } from '../context/BookingContext'

export default function RoomSelection() {
  const { state, rooms, update } = useBooking()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(state.room?.id || null)
  const [time, setTime] = useState(state.time || '')

  const selectedRoom = rooms.find((r) => r.id === selectedId)
  const priceInfo = selectedRoom ? roomTypes.find((t) => t.id === selectedRoom.type) : null

  const canContinue = selectedRoom && time

  const goNext = () => {
    update({ room: selectedRoom, time, date: state.date || new Date().toISOString().slice(0, 10) })
    navigate('/addons')
  }

  return (
    <section>
      <p className="eyebrow">ระยะที่ 3 · เลือกห้อง & วันเวลา</p>
      <h1 className="page-title">
        แผนผังห้อง{state.branch ? ` — ${state.branch.name}` : ''} (มุมมอง 3D)
      </h1>
      <p className="page-sub">
        หมุนมุมมองและคลิกที่ห้องเพื่อเลือก ไฟสีแดงหมายถึงห้องไม่ว่าง ไฟสีเขียว/ฟ้าหมายถึงห้องว่าง
      </p>

      <Room3D rooms={rooms} selectedId={selectedId} onSelect={setSelectedId} />
      <RoomLegend />

      <div className="panel" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>เลือกช่วงเวลา</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {timeSlots.map((t) => (
            <button
              key={t}
              onClick={() => setTime(t)}
              className="btn-ghost"
              style={{
                borderColor: time === t ? 'var(--neon-cyan)' : undefined,
                color: time === t ? 'var(--neon-cyan)' : undefined,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {selectedRoom && (
          <div style={{ marginTop: 18, fontSize: 14, color: 'var(--text-dim)' }}>
            เลือกแล้ว: <strong style={{ color: 'var(--text-main)' }}>{selectedRoom.name}</strong>
            {priceInfo && <> · {priceInfo.label} · {priceInfo.pricePerHr}฿/ชม.</>}
          </div>
        )}
      </div>

      <button className="btn-primary" style={{ marginTop: 24 }} disabled={!canContinue} onClick={goNext}>
        ไปต่อ: เพิ่มบริการเสริม →
      </button>
    </section>
  )
}
