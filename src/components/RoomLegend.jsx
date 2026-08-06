export default function RoomLegend() {
  const items = [
    { color: 'var(--status-available)', label: 'ว่าง' },
    { color: 'var(--status-occupied)', label: 'ไม่ว่าง' },
    { color: 'var(--neon-gold)', label: 'ห้องที่เลือก' },
  ]
  return (
    <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: it.color, boxShadow: `0 0 8px ${it.color}`, display: 'inline-block' }} />
          {it.label}
        </div>
      ))}
    </div>
  )
}
