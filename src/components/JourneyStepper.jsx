import './JourneyStepper.css'

export const PHASES = [
  { path: '/', label: 'ค้นหาข้อมูล' },
  { path: '/search', label: 'ค้นหาห้อง' },
  { path: '/rooms', label: 'เลือกห้อง & เวลา' },
  { path: '/addons', label: 'บริการเสริม' },
  { path: '/auth', label: 'สมัคร/เข้าสู่ระบบ' },
  { path: '/checkout', label: 'ตรวจสอบ & ชำระเงิน' },
  { path: '/confirmation', label: 'ยืนยันการจอง' },
  { path: '/notifications', label: 'แจ้งเตือน' },
  { path: '/checkin', label: 'เช็คอิน' },
  { path: '/review', label: 'รีวิว' },
]

export default function JourneyStepper({ currentPath }) {
  const activeIdx = PHASES.findIndex((p) => p.path === currentPath)
  return (
    <ol className="stepper" aria-label="ขั้นตอนการจองห้องคาราโอเกะ">
      {PHASES.map((p, i) => {
        const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'todo'
        return (
          <li key={p.path} className={`stepper-item ${state}`}>
            <span className="stepper-dot">{i + 1}</span>
            <span className="stepper-label">{p.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
