import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBooking } from '../context/BookingContext'
import { roomTypes } from '../data/rooms'

const payMethods = [
  { id: 'promptpay', label: 'PromptPay QR' },
  { id: 'card', label: 'บัตรเครดิต/เดบิต' },
  { id: 'wallet', label: 'TrueMoney Wallet' },
]

export default function Checkout() {
  const { state, addOnServices, createBooking, payBooking } = useBooking()
  const navigate = useNavigate()
  const [method, setMethod] = useState('promptpay')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const roomType = state.room ? roomTypes.find((type) => type.id === state.room.type) : null
  const addOnTotal = state.addOns.reduce((sum, id) => {
    const service = addOnServices.find((item) => item.id === id)
    return sum + (service?.price || 0)
  }, 0)
  const roomTotal = state.room ? (state.room.pricePerHour || roomType?.pricePerHr || 0) * 2 : 0
  const estimatedTotal = roomTotal + addOnTotal
  const total = state.booking?.totalAmount ?? estimatedTotal

  const pay = async () => {
    if (!state.user) {
      navigate('/auth')
      return
    }
    if (!state.branch || !state.room || !state.date || !state.time) return

    setProcessing(true)
    setError('')
    try {
      let booking = state.booking
      if (!booking || booking.status === 'CANCELLED') {
        booking = await createBooking({
          branchId: state.branch.id,
          roomId: state.room.id,
          bookingDate: state.date,
          startTime: state.time,
          durationHours: 2,
          addOns: state.addOns.map((id) => ({ id, quantity: 1 })),
        })
      }

      if (booking.paymentStatus !== 'PAID') {
        await payBooking(booking.id)
      }
      navigate('/confirmation')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setProcessing(false)
    }
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
        <Row label="สมาชิก" value={state.user ? `${state.user.firstName} ${state.user.lastName}` : 'ยังไม่ได้เข้าสู่ระบบ'} />
        <Row label="สาขา" value={state.branch?.name} />
        <Row label="ห้อง" value={`${state.room.name} (${roomType?.label || state.room.type})`} />
        <Row label="วันที่ / เวลา" value={`${state.date} · ${state.time}`} />
        <Row label="บริการเสริม" value={state.addOns.length ? state.addOns.map((id) => addOnServices.find((item) => item.id === id)?.name).join(', ') : 'ไม่มี'} />
        <hr style={{ borderColor: 'var(--line)' }} />
        <Row label="ค่าห้อง (2 ชม.)" value={`${roomTotal}฿`} />
        <Row label="บริการเสริมรวม" value={`${addOnTotal}฿`} />
        <Row label="รวมทั้งสิ้น" value={`${total}฿`} bold />
      </div>

      {state.user ? (
        <>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>ช่องทางชำระเงิน</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {payMethods.map((item) => (
                <button
                  key={item.id}
                  className="btn-ghost"
                  onClick={() => setMethod(item.id)}
                  style={{
                    borderColor: method === item.id ? 'var(--neon-cyan)' : undefined,
                    color: method === item.id ? 'var(--neon-cyan)' : undefined,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 0 }}>
              โหมดนี้จำลองการชำระเงินและจะยืนยัน booking ผ่าน API
            </p>
          </div>

          {error && <p style={{ color: 'var(--status-occupied)', marginTop: 16 }}>{error}</p>}
          <button className="btn-primary" style={{ marginTop: 24 }} disabled={processing} onClick={pay}>
            {processing ? 'กำลังดำเนินการ...' : `ชำระเงิน ${total}฿ →`}
          </button>
        </>
      ) : (
        <div className="panel" style={{ borderColor: 'rgba(255, 179, 61, 0.45)' }}>
          <p className="eyebrow" style={{ margin: 0 }}>GUEST CHECKOUT</p>
          <h3 style={{ margin: '8px 0 6px' }}>เหลืออีกขั้นเดียวก็จองได้แล้ว</h3>
          <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
            คุณเลือกห้องและบริการเสริมได้โดยไม่ต้อง login แต่ระบบต้องใช้บัญชีสมาชิกเพื่อยืนยัน booking และเก็บประวัติการจอง
          </p>
          <button className="btn-primary" onClick={() => navigate('/auth')}>
            เข้าสู่ระบบ / สมัครสมาชิก →
          </button>
        </div>
      )}
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
