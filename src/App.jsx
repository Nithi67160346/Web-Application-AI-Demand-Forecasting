import { HashRouter, Routes, Route, useLocation } from 'react-router-dom'
import { BookingProvider } from './context/BookingContext'
import Navbar from './components/Navbar'
import JourneyStepper from './components/JourneyStepper'

import Home from './pages/Home'
import SearchRooms from './pages/SearchRooms'
import RoomSelection from './pages/RoomSelection'
import AddOns from './pages/AddOns'
import Auth from './pages/Auth'
import Checkout from './pages/Checkout'
import Confirmation from './pages/Confirmation'
import Notifications from './pages/Notifications'
import CheckIn from './pages/CheckIn'
import Review from './pages/Review'

function Layout() {
  const location = useLocation()
  return (
    <>
      <Navbar />
      <main className="app-shell" style={{ paddingTop: 28 }}>
        <JourneyStepper currentPath={location.pathname} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<SearchRooms />} />
          <Route path="/rooms" element={<RoomSelection />} />
          <Route path="/addons" element={<AddOns />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/confirmation" element={<Confirmation />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/review" element={<Review />} />
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  return (
    <BookingProvider>
      <HashRouter>
        <Layout />
      </HashRouter>
    </BookingProvider>
  )
}
