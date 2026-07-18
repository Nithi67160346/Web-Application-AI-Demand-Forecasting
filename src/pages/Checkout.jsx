import { useNavigate } from 'react-router-dom'
import { useBooking } from '../context/BookingContext'
import { addOnServices, roomTypes } from '../data/rooms'
import { useState } from 'react'

const payMethods = [
  { id: 'promptpay', label: 'PromptPay QR' },
  { id: 'card', label: 'บัตรเครดิต/เดบิต' },
  { id: 'wallet', label: 'TrueMoney Wallet' },
]

export default function Checkout() {
  const { state, confirmBooking } = useBooking()
  const navigate = useNavigate()
  const [method, setMethod] = useState('promptpay')
  const [processing, setProcessing] = useState(false)

  const roomType = state.room ? roomTypes.find((t) => t.id === state.room.type) : null
  const addOnTotal = state.addOns.reduce((sum, id) => {
    const svc = addOnServices.find((s) => s.id === id)
    return sum + (svc?.price || 0)
  }, 0)
  const roomTotal = roomType ? roomType.pricePerHr * 2 : 0 // assume 2-hr default booking
  const total = roomTotal + addOnTotal

  const pay = () => {
    setProcessing(true)
    // Mock payment gateway call (Omise / 2C2P / Stripe, etc.)
    setTimeout(() => {
      confirmBooking()
      setProcessing(false)
      navigate('/confirmation')
    }, 900)
  }

  if (!state.room) {
    return (
      <section>
        <p className="page-sub">ยังไม่ได้เลือกห้อง กรุณาย้อนกลับไปเลือกห้องก่อน</p>
        <button className="btn-primary" onClick={() => navigate('/rooms')}>เลือกห้อง →</button>
      </section>
    )
  }

  return (
    <section>
      <p className="eyebrow">ระยะที่ 6 · ตรวจสอบ & ชำระเงิน</p>
      <h1 className="page-title">สรุปคำสั่งจอง</h1>

      <div className="panel" style={{ marginBottom: 20 }}>
        <Row label="สาขา" value={state.branch?.name} />
        <Row label="ห้อง" value={`${state.room.name} (${roomType?.label})`} />
        <Row label="วันที่ / เวลา" value={`${state.date} · ${state.time}`} />
        <Row label="บริการเสริม" value={state.addOns.length ? state.addOns.map((id) => addOnServices.find((s) => s.id === id)?.name).join(', ') : 'ไม่มี'} />
        <hr style={{ borderColor: 'var(--line)' }} />
        <Row label="ค่าห้อง (2 ชม.)" value={`${roomTotal}฿`} />
        <Row label="บริการเสริมรวม" value={`${addOnTotal}฿`} />
        <Row label="รวมทั้งสิ้น" value={`${total}฿`} bold />
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>ช่องทางชำระเงิน</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {payMethods.map((m) => (
            <button
              key={m.id}
              className="btn-ghost"
              onClick={() => setMethod(m.id)}
              style={{
                borderColor: method === m.id ? 'var(--neon-cyan)' : undefined,
                color: method === m.id ? 'var(--neon-cyan)' : undefined,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <button className="btn-primary" style={{ marginTop: 24 }} disabled={processing} onClick={pay}>
        {processing ? 'กำลังดำเนินการ...' : `ชำระเงิน ${total}฿ →`}
      </button>
    </section>
  )
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}
