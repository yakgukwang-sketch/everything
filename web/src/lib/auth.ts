import { API_URL } from "./shared";

const TOKEN_KEY = "seller_token";
const SELLER_KEY = "seller_info";

export type SellerInfo = {
  id: number;
  email: string;
  name: string;
  business_name?: string;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getSeller(): SellerInfo | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SELLER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveAuth(token: string, seller: SellerInfo) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SELLER_KEY, JSON.stringify(seller));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SELLER_KEY);
}

export async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const token = getToken();
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}
