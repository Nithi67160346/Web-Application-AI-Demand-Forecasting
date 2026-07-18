import { useNavigate } from 'react-router-dom'
import { useBooking } from '../context/BookingContext'

const providers = [
  { id: 'google', label: 'ดำเนินการต่อด้วย Google', icon: '🟢' },
  { id: 'line', label: 'ดำเนินการต่อด้วย LINE', icon: '💚' },
  { id: 'facebook', label: 'ดำเนินการต่อด้วย Facebook', icon: '🔵' },
]

export default function Auth() {
  const { update } = useBooking()
  const navigate = useNavigate()

  const login = (provider) => {
    // Mock login — replace with real OAuth (NextAuth / Firebase Auth / Supabase Auth, etc.)
    update({ user: { name: 'สมชาย ใจดี', provider } })
    navigate('/checkout')
  }

  return (
    <section>
      <p className="eyebrow">ระยะที่ 5 · สมัคร / เข้าสู่ระบบ</p>
      <h1 className="page-title">เข้าสู่ระบบเพื่อยืนยันตัวตน</h1>
      <p className="page-sub">กรอกข้อมูลสมาชิกทีเดียว หรือ Login ผ่าน Social ได้ทันที ไม่ต้องพิมพ์ยาว ๆ</p>

      <div className="panel" style={{ display: 'grid', gap: 12, maxWidth: 380 }}>
        {providers.map((p) => (
          <button key={p.id} className="btn-ghost" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => login(p.id)}>
            {p.icon}  {p.label}
          </button>
        ))}
        <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, margin: '4px 0' }}>หรือ</div>
        <button className="btn-primary" onClick={() => login('email')}>สมัครด้วยอีเมล / เบอร์โทร</button>
      </div>
    </section>
  )
}
