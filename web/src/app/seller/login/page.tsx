"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/shared";
import { saveAuth } from "@/lib/auth";

export default function SellerLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/sellers/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error);
        return;
      }

      saveAuth(data.token, data.seller);
      router.push("/seller/dashboard");
    } catch {
      setError("서버 연결에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="results-page">
      <header className="results-header">
        <div className="results-logo" onClick={() => router.push("/")}>
          <span style={{ color: "#4285f4" }}>e</span>
          <span style={{ color: "#ea4335" }}>v</span>
          <span>e</span>
          <span style={{ color: "#4285f4" }}>r</span>
          <span style={{ color: "#34a853" }}>y</span>
          <span>t</span>
          <span style={{ color: "#fbbc05" }}>h</span>
          <span>i</span>
          <span style={{ color: "#ea4335" }}>n</span>
          <span style={{ color: "#4285f4" }}>g</span>
        </div>
        <div style={{ fontSize: 14, color: "#5f6368" }}>
          <span onClick={() => router.push("/seller/register")} style={{ cursor: "pointer" }}>회원가입</span>
        </div>
      </header>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>셀러 로그인</h1>
        <p style={{ fontSize: 14, color: "#5f6368", marginBottom: 32 }}>
          셀러 계정으로 로그인하여 상품을 관리하세요.
        </p>

        {error && (
          <div style={{
            padding: "12px 16px", borderRadius: 8, marginBottom: 20,
            background: "#fce8e6", color: "#c5221f", fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="submit-field">
            <label className="submit-label">이메일</label>
            <input className="submit-input" name="email" type="email" value={form.email} onChange={handleChange} placeholder="seller@example.com" required />
          </div>

          <div className="submit-field">
            <label className="submit-label">비밀번호</label>
            <input className="submit-input" name="password" type="password" value={form.password} onChange={handleChange} placeholder="비밀번호" required />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%", padding: "14px", fontSize: 16, fontWeight: 600,
              color: "#fff", background: submitting ? "#9aa0a6" : "#1a73e8",
              border: "none", borderRadius: 12, cursor: submitting ? "not-allowed" : "pointer",
              marginTop: 8,
            }}
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: "#5f6368" }}>
          계정이 없으신가요?{" "}
          <span onClick={() => router.push("/seller/register")} style={{ color: "#1a73e8", cursor: "pointer", fontWeight: 500 }}>
            회원가입
          </span>
        </p>
      </div>
    </div>
  );
}
