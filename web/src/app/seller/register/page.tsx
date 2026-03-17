"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/shared";
import { saveAuth } from "@/lib/auth";

export default function SellerRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    business_name: "",
    phone: "",
  });
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
      const res = await fetch(`${API_URL}/api/sellers/register`, {
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
          <span onClick={() => router.push("/seller/login")} style={{ cursor: "pointer" }}>로그인</span>
        </div>
      </header>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>셀러 회원가입</h1>
        <p style={{ fontSize: 14, color: "#5f6368", marginBottom: 32 }}>
          상품을 등록하고 AI 에이전트를 통해 판매하세요. 수수료 없이 가격만 정하면 됩니다.
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
            <label className="submit-label">이메일 <span className="submit-required">*</span></label>
            <input className="submit-input" name="email" type="email" value={form.email} onChange={handleChange} placeholder="seller@example.com" required />
          </div>

          <div className="submit-field">
            <label className="submit-label">비밀번호 <span className="submit-required">*</span></label>
            <input className="submit-input" name="password" type="password" value={form.password} onChange={handleChange} placeholder="8자 이상" required minLength={8} />
          </div>

          <div className="submit-field">
            <label className="submit-label">이름 <span className="submit-required">*</span></label>
            <input className="submit-input" name="name" value={form.name} onChange={handleChange} placeholder="홍길동" required />
          </div>

          <div className="submit-field">
            <label className="submit-label">사업자명 / 스토어명</label>
            <input className="submit-input" name="business_name" value={form.business_name} onChange={handleChange} placeholder="홍길동마켓 (선택)" />
          </div>

          <div className="submit-field">
            <label className="submit-label">전화번호</label>
            <input className="submit-input" name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="010-0000-0000 (선택)" />
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
            {submitting ? "가입 중..." : "셀러 가입하기"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: "#5f6368" }}>
          이미 계정이 있으신가요?{" "}
          <span onClick={() => router.push("/seller/login")} style={{ color: "#1a73e8", cursor: "pointer", fontWeight: 500 }}>
            로그인
          </span>
        </p>
      </div>
    </div>
  );
}
