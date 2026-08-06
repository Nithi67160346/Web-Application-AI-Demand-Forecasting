const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('accessToken')
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const body = options.body && typeof options.body !== 'string'
    ? JSON.stringify(options.body)
    : options.body

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body,
  })

  const raw = await response.text()
  let result = {}
  try {
    result = raw ? JSON.parse(raw) : {}
  } catch {
    result = { error: { message: raw || 'เซิร์ฟเวอร์ส่งข้อมูลที่อ่านไม่ได้' } }
  }

  if (!response.ok) {
    const error = new Error(result.error?.message || 'เกิดข้อผิดพลาดจาก API')
    error.status = response.status
    error.code = result.error?.code
    throw error
  }

  return result.data
}

export function clearAccessToken() {
  localStorage.removeItem('accessToken')
}

