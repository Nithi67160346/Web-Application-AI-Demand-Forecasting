import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch, clearAccessToken } from '../services/api'

const BookingContext = createContext(null)

const initialState = {
  branch: null,
  date: '',
  time: '',
  room: null,
  roomType: '',
  partySize: 4,
  addOns: [],
  user: null,
  booking: null,
  paid: false,
  bookingCode: null,
  checkedIn: false,
  review: null,
}

function normalizeRoom(room) {
  return {
    ...room,
    type: room.type?.toLowerCase(),
    col: room.gridColumn,
    row: room.gridRow,
    status: room.available || room.status === 'AVAILABLE' ? 'available' : 'occupied',
  }
}

export function BookingProvider({ children }) {
  const [state, setState] = useState(initialState)
  const [branches, setBranches] = useState([])
  const [rooms, setRooms] = useState([])
  const [addOnServices, setAddOnServices] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomError, setRoomError] = useState('')

  const update = useCallback((patch) => {
    setState((current) => ({ ...current, ...patch }))
  }, [])

  const loadRooms = useCallback(async (branchId, date, startTime, durationHours = 2) => {
    if (!branchId) {
      setRooms([])
      return []
    }

    const params = new URLSearchParams({
      date,
      startTime,
      durationHours: String(durationHours),
    })

    setRoomsLoading(true)
    setRoomError('')
    try {
      const data = await apiFetch(`/branches/${encodeURIComponent(branchId)}/rooms?${params}`)
      const normalized = (data || []).map(normalizeRoom)
      setRooms(normalized)
      return normalized
    } catch (error) {
      setRoomError(error.message)
      throw error
    } finally {
      setRoomsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadInitialData() {
      setCatalogLoading(true)
      setCatalogError('')
      try {
        const [branchData, addOnData] = await Promise.all([
          apiFetch('/branches'),
          apiFetch('/add-ons'),
        ])
        if (active) {
          setBranches(branchData || [])
          setAddOnServices(addOnData || [])
        }
      } catch (error) {
        if (active) setCatalogError(error.message)
      } finally {
        if (active) setCatalogLoading(false)
      }

      if (localStorage.getItem('accessToken')) {
        try {
          const user = await apiFetch('/me')
          if (active) update({ user })
        } catch {
          clearAccessToken()
        }
      }
      if (active) setAuthReady(true)
    }

    loadInitialData()
    return () => { active = false }
  }, [update])

  const toggleAddOn = useCallback((id) => {
    setState((current) => ({
      ...current,
      addOns: current.addOns.includes(id)
        ? current.addOns.filter((item) => item !== id)
        : [...current.addOns, id],
    }))
  }, [])

  const createBooking = useCallback(async (payload) => {
    const booking = await apiFetch('/bookings', { method: 'POST', body: payload })
    setState((current) => ({
      ...current,
      booking,
      bookingCode: booking.code,
      paid: booking.paymentStatus === 'PAID',
    }))
    return booking
  }, [])

  const payBooking = useCallback(async (bookingId) => {
    const booking = await apiFetch(`/bookings/${encodeURIComponent(bookingId)}/pay`, { method: 'POST' })
    setState((current) => ({
      ...current,
      booking,
      bookingCode: booking.code,
      paid: booking.paymentStatus === 'PAID',
    }))
    return booking
  }, [])

  const checkInBooking = useCallback(async (bookingId) => {
    const booking = await apiFetch(`/bookings/${encodeURIComponent(bookingId)}/check-in`, { method: 'POST' })
    setState((current) => ({ ...current, booking, checkedIn: true }))
    return booking
  }, [])

  const submitReview = useCallback(async (bookingId, payload) => {
    const booking = await apiFetch(`/bookings/${encodeURIComponent(bookingId)}/review`, {
      method: 'POST',
      body: payload,
    })
    setState((current) => ({ ...current, booking, review: booking.review }))
    return booking
  }, [])

  const logout = useCallback(async () => {
    try {
      if (localStorage.getItem('accessToken')) {
        await apiFetch('/auth/logout', { method: 'POST' })
      }
    } finally {
      clearAccessToken()
      setState(initialState)
      setRooms([])
    }
  }, [])

  const reset = useCallback(() => {
    setState(initialState)
    setRooms([])
  }, [])

  const value = useMemo(
    () => ({
      state,
      branches,
      rooms,
      addOnServices,
      catalogLoading,
      catalogError,
      authReady,
      isAuthenticated: Boolean(state.user),
      roomsLoading,
      roomError,
      update,
      loadRooms,
      toggleAddOn,
      createBooking,
      payBooking,
      checkInBooking,
      submitReview,
      logout,
      reset,
    }),
    [
      state,
      branches,
      rooms,
      addOnServices,
      catalogLoading,
      catalogError,
      authReady,
      roomsLoading,
      roomError,
      update,
      loadRooms,
      toggleAddOn,
      createBooking,
      payBooking,
      checkInBooking,
      submitReview,
      logout,
      reset,
    ],
  )

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
}

export const useBooking = () => {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking must be used within BookingProvider')
  return ctx
}
