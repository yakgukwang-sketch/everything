"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, CATEGORIES } from "@/lib/shared";

export default function SubmitPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: "",
    title: "",
    description: "",
    url: "",
    image_url: "",
    original_price: "",
    sale_price: "",
    category: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/deals/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          original_price: form.original_price ? Number(form.original_price) : 0,
          sale_price: form.sale_price ? Number(form.sale_price) : 0,
        }),
      });
      const data = await res.json();
      setResult({ success: data.success, message: data.message || data.error });

      if (data.success) {
        setForm({
          business_name: form.business_name,
          title: "",
          description: "",
          url: "",
          image_url: "",
          original_price: "",
          sale_price: "",
          category: "",
        });
      }
    } catch (err) {
      setResult({ success: false, message: "서버 연결에 실패했습니다" });
    } finally {
      setSubmitting(false);
    }
  };

  const discountRate = form.original_price && form.sale_price &&
    Number(form.sale_price) < Number(form.original_price)
    ? Math.round((1 - Number(form.sale_price) / Number(form.original_price)) * 100)
    : 0;

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
          <span onClick={() => router.push("/agents")} style={{ cursor: "pointer", marginRight: 16 }}>에이전트</span>
          <span style={{ color: "#1a73e8", fontWeight: 600 }}>상품 등록</span>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>상품 직접 등록</h1>
        <p style={{ fontSize: 14, color: "#5f6368", marginBottom: 32 }}>
          사업자/판매자가 직접 할인 상품을 등록할 수 있습니다. 등록된 상품은 AI 에이전트가 소비자에게 추천합니다.
        </p>

        {result && (
          <div style={{
            padding: "14px 20px",
            borderRadius: 12,
            marginBottom: 24,
            background: result.success ? "#e6f4ea" : "#fce8e6",
            color: result.success ? "#137333" : "#c5221f",
            fontSize: 14,
            fontWeight: 500,
          }}>
            {result.message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 사업자명 */}
          <div className="submit-field">
            <label className="submit-label">
              사업자명 / 스토어명 <span className="submit-required">*</span>
            </label>
            <input
              className="submit-input"
              name="business_name"
              value={form.business_name}
              onChange={handleChange}
              placeholder="예: 홍길동마켓"
              required
            />
          </div>

          {/* 상품명 */}
          <div className="submit-field">
            <label className="submit-label">
              상품명 <span className="submit-required">*</span>
            </label>
            <input
              className="submit-input"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="예: [특가] 삼성 갤럭시 버즈3 프로 블랙"
              required
            />
          </div>

          {/* 상품 설명 */}
          <div className="submit-field">
            <label className="submit-label">상품 설명</label>
            <textarea
              className="submit-textarea"
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="상품에 대한 간단한 설명을 작성해주세요"
              rows={3}
            />
          </div>

          {/* 상품 URL */}
          <div className="submit-field">
            <label className="submit-label">
              상품 페이지 URL <span className="submit-required">*</span>
            </label>
            <input
              className="submit-input"
              name="url"
              type="url"
              value={form.url}
              onChange={handleChange}
              placeholder="https://..."
              required
            />
          </div>

          {/* 이미지 URL */}
          <div className="submit-field">
            <label className="submit-label">상품 이미지 URL</label>
            <input
              className="submit-input"
              name="image_url"
              type="url"
              value={form.image_url}
              onChange={handleChange}
              placeholder="https://... (이미지 직접 링크)"
            />
            {form.image_url && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={form.image_url}
                  alt="미리보기"
                  style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, border: "1px solid #e0e0e0" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </div>

          {/* 가격 */}
          <div style={{ display: "flex", gap: 16 }}>
            <div className="submit-field" style={{ flex: 1 }}>
              <label className="submit-label">정가 (원)</label>
              <input
                className="submit-input"
                name="original_price"
                type="number"
                min="0"
                value={form.original_price}
                onChange={handleChange}
                placeholder="0"
              />
            </div>
            <div className="submit-field" style={{ flex: 1 }}>
              <label className="submit-label">할인가 (원)</label>
              <input
                className="submit-input"
                name="sale_price"
                type="number"
                min="0"
                value={form.sale_price}
                onChange={handleChange}
                placeholder="0"
              />
            </div>
          </div>

          {discountRate > 0 && (
            <div style={{ fontSize: 14, color: "#ea4335", fontWeight: 600, marginBottom: 16 }}>
              {discountRate}% 할인
            </div>
          )}

          {/* 카테고리 */}
          <div className="submit-field">
            <label className="submit-label">카테고리</label>
            <select
              className="submit-input"
              name="category"
              value={form.category}
              onChange={handleChange}
            >
              <option value="">선택해주세요</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 미리보기 */}
          {form.title && (
            <div style={{
              padding: 16,
              border: "1px solid #e0e0e0",
              borderRadius: 12,
              marginBottom: 24,
              background: "#fafafa",
            }}>
              <div style={{ fontSize: 12, color: "#5f6368", marginBottom: 8 }}>미리보기</div>
              <div style={{ display: "flex", gap: 12 }}>
                {form.image_url && (
                  <img
                    src={form.image_url}
                    alt=""
                    style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div>
                  <div style={{ fontSize: 11, marginBottom: 4 }}>
                    <span style={{
                      background: "#6c5ce7",
                      color: "#fff",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {form.business_name || "사업자"}
                    </span>
                    {form.category && <span style={{ color: "#5f6368", marginLeft: 8 }}>{form.category}</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{form.title}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {discountRate > 0 && (
                      <span style={{ color: "#ea4335", fontWeight: 700, fontSize: 16 }}>{discountRate}%</span>
                    )}
                    {form.sale_price && (
                      <span style={{ fontWeight: 700, fontSize: 16 }}>
                        {Number(form.sale_price).toLocaleString()}원
                      </span>
                    )}
                    {form.original_price && form.sale_price && Number(form.sale_price) < Number(form.original_price) && (
                      <span style={{ textDecoration: "line-through", color: "#9aa0a6", fontSize: 13 }}>
                        {Number(form.original_price).toLocaleString()}원
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: 16,
              fontWeight: 600,
              color: "#fff",
              background: submitting ? "#9aa0a6" : "#1a73e8",
              border: "none",
              borderRadius: 12,
              cursor: submitting ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {submitting ? "등록 중..." : "상품 등록하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
