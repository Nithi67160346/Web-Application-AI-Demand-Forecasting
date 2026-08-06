import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../services/api'
import { useBooking } from '../context/BookingContext'
import './Auth.css'

const initialForm = {
  identifier: 'demo_user',
  username: '',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  phone: '',
}

export default function Auth() {
  const { update } = useBooking()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(initialForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const setField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      const data = mode === 'login'
        ? await apiFetch('/auth/login', {
            method: 'POST',
            body: { identifier: form.identifier, password: form.password },
          })
        : await apiFetch('/auth/register', {
            method: 'POST',
            body: {
              username: form.username,
              email: form.email,
              password: form.password,
              firstName: form.firstName,
              lastName: form.lastName,
              phone: form.phone || undefined,
            },
          })

      localStorage.setItem('accessToken', data.accessToken)
      update({ user: data.user })
      navigate('/checkout')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setError('')
  }

  return (
    <section className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">KARAOKE BOOKING · MEMBER ACCESS</p>
        <h1 className="page-title">จองเพลงดี ๆ ให้ค่ำคืนนี้</h1>
        <p className="auth-intro-copy">
          สมัครสมาชิกเพื่อยืนยันการจอง เก็บประวัติการใช้บริการ และเช็คอินได้รวดเร็วขึ้น
          แต่ถ้ายังไม่พร้อม ก็เลือกดูสาขาและห้องว่างใน Guest Mode ได้ก่อน
        </p>

        <div className="auth-benefits">
          <div className="auth-benefit"><span className="auth-benefit-mark">✓</span><span>จองห้องและชำระเงินผ่านระบบ</span></div>
          <div className="auth-benefit"><span className="auth-benefit-mark">✓</span><span>เช็คอินและส่งรีวิวหลังใช้บริการ</span></div>
          <div className="auth-benefit"><span className="auth-benefit-mark">✓</span><span>ข้อมูลบัญชีถูกป้องกันด้วย session token</span></div>
        </div>

        <div className="auth-guest-box">
          <span className="guest-badge">Guest Mode</span>
          <h3>ยังไม่อยากสมัครตอนนี้?</h3>
          <p>ดูสาขา ห้องว่าง ประเภทห้อง และบริการเสริมได้โดยไม่ต้องเข้าสู่ระบบ ระบบจะขอ login เฉพาะตอนยืนยันการจอง</p>
          <button className="btn-ghost" type="button" onClick={() => navigate('/search')}>
            ดำเนินการต่อแบบ Guest →
          </button>
        </div>
      </div>

      <div className="panel auth-card">
        <div style={{ marginBottom: 20 }}>
          <p className="eyebrow">SECURE CHECKOUT</p>
          <h2 style={{ margin: '8px 0 6px' }}>{mode === 'login' ? 'ยินดีต้อนรับกลับมา' : 'สร้างบัญชีสมาชิก'}</h2>
          <p className="auth-note">{mode === 'login' ? 'เข้าสู่ระบบเพื่อกลับไปยืนยัน booking ของคุณ' : 'ใช้เวลาไม่ถึงหนึ่งนาที แล้วไปต่อที่หน้า checkout ได้ทันที'}</p>
        </div>

        <div className="auth-switch" style={{ marginBottom: 18 }}>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            เข้าสู่ระบบ
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
            สมัครสมาชิก
          </button>
        </div>

        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          {mode === 'login' ? (
            <label style={labelStyle}>
              Username หรือ Email
              <input name="identifier" value={form.identifier} onChange={setField} required style={inputStyle} />
            </label>
          ) : (
            <>
              <label style={labelStyle}>
                Username
                <input name="username" value={form.username} onChange={setField} minLength={3} required style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Email
                <input type="email" name="email" value={form.email} onChange={setField} required style={inputStyle} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label style={labelStyle}>
                  ชื่อ
                  <input name="firstName" value={form.firstName} onChange={setField} required style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  นามสกุล
                  <input name="lastName" value={form.lastName} onChange={setField} required style={inputStyle} />
                </label>
              </div>
              <label style={labelStyle}>
                เบอร์โทรศัพท์ (ไม่บังคับ)
                <input name="phone" value={form.phone} onChange={setField} style={inputStyle} />
              </label>
            </>
          )}

          <label style={labelStyle}>
            รหัสผ่าน
            <input type="password" name="password" value={form.password} onChange={setField} minLength={8} required style={inputStyle} />
          </label>

          {mode === 'login' && <p className="auth-note">ทดลองใช้: demo_user / Demo12345!</p>}
          {error && <p style={{ color: 'var(--status-occupied)', margin: 0 }}>{error}</p>}

          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? 'กำลังดำเนินการ...' : mode === 'login' ? 'เข้าสู่ระบบ →' : 'สมัครสมาชิก →'}
          </button>
        </form>
      </div>
    </section>
  )
}

const labelStyle = {
  display: 'grid',
  gap: 6,
  color: 'var(--text-dim)',
  fontSize: 13,
}

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--bg-void)',
  color: 'var(--text-main)',
  fontFamily: 'var(--font-body)',
}

