import { useNavigate } from 'react-router-dom'
import { addOnServices } from '../data/rooms'
import { useBooking } from '../context/BookingContext'

export default function AddOns() {
  const { state, toggleAddOn } = useBooking()
  const navigate = useNavigate()

  return (
    <section>
      <p className="eyebrow">ระยะที่ 4 · เพิ่มบริการเสริม</p>
      <h1 className="page-title">อยากเพิ่มความพิเศษไหม?</h1>
      <p className="page-sub">เลือกได้มากกว่า 1 รายการ หรือข้ามไปก่อนแล้วค่อยเพิ่มทีหลังก็ได้</p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {addOnServices.map((svc) => {
          const active = state.addOns.includes(svc.id)
          return (
            <button
              key={svc.id}
              onClick={() => toggleAddOn(svc.id)}
              className="panel"
              style={{
                textAlign: 'left',
                border: active ? '1px solid var(--neon-magenta)' : '1px solid var(--line)',
                boxShadow: active ? '0 0 24px rgba(255,46,136,0.25)' : 'none',
              }}
            >
              <div style={{ fontSize: 26 }}>{svc.icon}</div>
              <div style={{ fontWeight: 600, margin: '8px 0 4px' }}>{svc.name}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                {svc.price === 0 ? 'ฟรี' : `+${svc.price}฿`}
              </div>
            </button>
          )
        })}
      </div>

      <button className="btn-primary" style={{ marginTop: 24 }} onClick={() => navigate('/auth')}>
        ไปต่อ: สมัคร / เข้าสู่ระบบ →
      </button>
    </section>
  )
}
