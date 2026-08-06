import { Link, useNavigate } from 'react-router-dom'
import { useBooking } from '../context/BookingContext'
import './Navbar.css'

export default function Navbar() {
  const { state, logout } = useBooking()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      navigate('/')
    }
  }

  return (
    <header className="nav">
      <div className="nav-inner app-shell">
        <Link to="/" className="brand">
          <span className="brand-dot" />
          คาราโอเกะ<span className="brand-accent">โอเกะ</span>
        </Link>
        <nav className="nav-links">
          <Link to="/search">ค้นหาห้อง</Link>
          <Link to="/checkin">เช็คอิน</Link>
          <Link to="/review">รีวิว</Link>
          {state.user ? (
            <span className="nav-mode member">Member</span>
          ) : (
            <>
              <span className="nav-mode guest">Guest</span>
              <Link to="/auth">เข้าสู่ระบบ</Link>
            </>
          )}
          {state.user && (
            <button className="btn-ghost" onClick={handleLogout} style={{ padding: '6px 12px', fontSize: 12 }}>
              ออกจากระบบ
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}
