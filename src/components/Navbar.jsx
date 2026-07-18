import { Link } from 'react-router-dom'
import './Navbar.css'

export default function Navbar() {
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
        </nav>
      </div>
    </header>
  )
}
