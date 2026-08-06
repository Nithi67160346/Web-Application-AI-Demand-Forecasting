import { useState } from 'react'
import { useBooking } from '../context/BookingContext'

export default function Review() {
  const { state, submitReview } = useBooking()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!state.booking?.id) {
      setError('ไม่พบ booking กรุณาเข้าสู่ระบบและเช็คอินก่อน')
      return
    }

    setBusy(true)
    setError('')
    try {
      await submitReview(state.booking.id, { rating, comment })
      setSubmitted(true)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <section style={{ textAlign: 'center' }}>
        <p className="eyebrow">ระยะที่ 10 · รีวิว / Feedback</p>
        <h1 className="page-title">ขอบคุณสำหรับรีวิว! 💛</h1>
        <p className="page-sub" style={{ margin: '0 auto' }}>ความคิดเห็นของคุณถูกบันทึกลงฐานข้อมูลแล้ว</p>
      </section>
    )
  }

  return (
    <section>
      <p className="eyebrow">ระยะที่ 10 · รีวิว / Feedback</p>
      <h1 className="page-title">วันนี้เป็นอย่างไรบ้าง?</h1>
      <p className="page-sub">ให้คะแนนและแชร์ประสบการณ์ของคุณ ({state.room?.name || 'ห้องของคุณ'})</p>

      <div className="panel" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, fontSize: 30 }}>
          {[1, 2, 3, 4, 5].map((number) => (
            <button
              key={number}
              onClick={() => setRating(number)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: number <= rating ? 1 : 0.3 }}
              aria-label={`ให้ ${number} ดาว`}
            >
              ⭐
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="เล่าประสบการณ์ของคุณ..."
          rows={4}
          style={{
            width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--line)',
            background: 'var(--bg-void)', color: 'var(--text-main)', fontFamily: 'var(--font-body)', resize: 'vertical',
          }}
        />
        {error && <p style={{ color: 'var(--status-occupied)' }}>{error}</p>}
        <button className="btn-primary" style={{ marginTop: 16 }} disabled={!rating || busy} onClick={submit}>
          {busy ? 'กำลังบันทึก...' : 'ส่งรีวิว →'}
        </button>
      </div>
    </section>
  )
}

