import { useState } from 'react'
import { useBooking } from '../context/BookingContext'

export default function Review() {
  const { update, state } = useBooking()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submit = () => {
    update({ review: { rating, comment } })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <section style={{ textAlign: 'center' }}>
        <p className="eyebrow">ระยะที่ 10 · รีวิว / Feedback</p>
        <h1 className="page-title">ขอบคุณสำหรับรีวิว! 💛</h1>
        <p className="page-sub" style={{ margin: '0 auto' }}>ความคิดเห็นของคุณช่วยให้ร้านพัฒนาบริการต่อไป</p>
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
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: n <= rating ? 1 : 0.3 }}
              aria-label={`ให้ ${n} ดาว`}
            >
              ⭐
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="เล่าประสบการณ์ของคุณ..."
          rows={4}
          style={{
            width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--line)',
            background: 'var(--bg-void)', color: 'var(--text-main)', fontFamily: 'var(--font-body)', resize: 'vertical',
          }}
        />
        <button className="btn-primary" style={{ marginTop: 16 }} disabled={!rating} onClick={submit}>
          ส่งรีวิว →
        </button>
      </div>
    </section>
  )
}
