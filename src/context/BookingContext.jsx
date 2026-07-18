import { createContext, useContext, useMemo, useState } from 'react'
import { generateRooms } from '../data/rooms'

const BookingContext = createContext(null)

const initialState = {
  branch: null,
  date: '',
  time: '',
  room: null,
  addOns: [],
  user: null,
  paid: false,
  bookingCode: null,
  checkedIn: false,
  review: null,
}

export function BookingProvider({ children }) {
  const [state, setState] = useState(initialState)
  const [rooms] = useState(() => generateRooms(3))

  const update = (patch) => setState((s) => ({ ...s, ...patch }))

  const toggleAddOn = (id) =>
    setState((s) => ({
      ...s,
      addOns: s.addOns.includes(id)
        ? s.addOns.filter((a) => a !== id)
        : [...s.addOns, id],
    }))

  const confirmBooking = () => {
    const code = 'KTV-' + Math.random().toString(36).slice(2, 8).toUpperCase()
    update({ paid: true, bookingCode: code })
    return code
  }

  const reset = () => setState(initialState)

  const value = useMemo(
    () => ({ state, rooms, update, toggleAddOn, confirmBooking, reset }),
    [state, rooms]
  )

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
}

export const useBooking = () => {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking must be used within BookingProvider')
  return ctx
}
