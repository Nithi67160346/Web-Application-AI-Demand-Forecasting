export type AuthUser = {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
};

type RequestOptions = RequestInit & { token?: string };

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const DEMO_USER_STORAGE_KEY = "demandly_demo_user";
const DEMO_ACCESS_TOKEN = "demandly-github-pages-demo-token";

function createDemoUser(values: Partial<AuthUser> = {}): AuthUser {
  const now = new Date().toISOString();
  return {
    id: values.id ?? 1,
    username: values.username ?? "demo-planner",
    email: values.email ?? "demo@demandly.local",
    full_name: values.full_name ?? "Demo Supply Chain Planner",
    role: values.role ?? "planner",
    is_active: true,
    created_at: values.created_at ?? now,
    updated_at: values.updated_at ?? now,
  };
}

function readDemoUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(DEMO_USER_STORAGE_KEY);
  if (!stored) return null;
  try {
    return createDemoUser(JSON.parse(stored) as Partial<AuthUser>);
  } catch {
    return null;
  }
}

function saveDemoUser(user: AuthUser) {
  if (typeof window !== "undefined") window.localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(user));
}

function demoAuthResponse(user: AuthUser): AuthResponse {
  return { access_token: DEMO_ACCESS_TOKEN, token_type: "bearer", expires_in: 86400, user };
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...init } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const body = await response.json().catch(() => null) as { detail?: string; message?: string } | T | null;
  if (!response.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? body.detail : undefined;
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return body as T;
}

export async function register(payload: { username: string; email: string; password: string; full_name: string }) {
  if (DEMO_MODE) {
    const user = createDemoUser({ username: payload.username, email: payload.email, full_name: payload.full_name });
    saveDemoUser(user);
    return demoAuthResponse(user);
  }
  return request<AuthResponse>("/register", { method: "POST", body: JSON.stringify(payload) });
}

export async function login(payload: { username_or_email: string; password: string }) {
  if (DEMO_MODE) {
    const storedUser = readDemoUser();
    const fallbackUsername = payload.username_or_email.includes("@") ? payload.username_or_email.split("@")[0] : payload.username_or_email;
    const user = storedUser ?? createDemoUser({ username: fallbackUsername || "demo-planner" });
    saveDemoUser(user);
    return demoAuthResponse(user);
  }
  return request<AuthResponse>("/login", { method: "POST", body: JSON.stringify(payload) });
}

export async function logout(token: string) {
  if (DEMO_MODE) return { message: "ออกจากโหมด Demo แล้ว" };
  return request<{ message: string }>("/logout", { method: "POST", token });
}

export async function getMe(token: string) {
  if (DEMO_MODE) return readDemoUser() ?? createDemoUser();
  return request<AuthUser>("/me", { token });
}

export async function changePassword(token: string, payload: { current_password: string; new_password: string }) {
  if (DEMO_MODE) return { message: "เปลี่ยนรหัสผ่านในโหมด Demo แล้ว" };
  return request<{ message: string }>("/change-password", { method: "POST", token, body: JSON.stringify(payload) });
}

export async function checkUsername(username: string) {
  if (DEMO_MODE) return { username, available: true };
  return request<{ username: string; available: boolean }>(`/check-username/${encodeURIComponent(username)}`);
}
