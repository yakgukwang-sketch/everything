"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, formatPrice } from "@/lib/shared";
import type { SellerProduct } from "@/lib/shared";
import { getToken, getSeller, clearAuth, fetchWithAuth } from "@/lib/auth";
import type { SellerInfo } from "@/lib/auth";

type Tab = "products" | "add";

export default function SellerDashboardPage() {
  const router = useRouter();
  const [seller, setSeller] = useState<SellerInfo | null>(null);
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Product form
  const [form, setForm] = useState({
    title: "", description: "", price: "", original_price: "",
    image_url: "", category: "", stock: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadProducts = useCallback(async () => {
    const res = await fetchWithAuth("/api/seller/products");
    const data = await res.json();
    if (data.success) setProducts(data.products);
  }, []);

  useEffect(() => {
    const token = getToken();
    const info = getSeller();
    if (!token || !info) {
      router.push("/seller/login");
      return;
    }
    setSeller(info);
    loadProducts().finally(() => setLoading(false));
  }, [router, loadProducts]);

  const handleLogout = () => {
    clearAuth();
    router.push("/seller/login");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetchWithAuth("/api/seller/products", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          price: Number(form.price),
          original_price: form.original_price ? Number(form.original_price) : undefined,
          image_url: form.image_url || undefined,
          category: form.category || undefined,
          stock: form.stock ? Number(form.stock) : -1,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ ok: true, text: "상품이 등록되었습니다!" });
        setForm({ title: "", description: "", price: "", original_price: "", image_url: "", category: "", stock: "" });
        await loadProducts();
        setTab("products");
      } else {
        setMessage({ ok: false, text: data.error });
      }
    } catch {
      setMessage({ ok: false, text: "서버 연결에 실패했습니다" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    const res = await fetchWithAuth(`/api/seller/products/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="results-page">
        <div style={{ textAlign: "center", padding: 80, color: "#5f6368" }}>로딩 중...</div>
      </div>
    );
  }

  const discountRate = form.original_price && form.price && Number(form.price) < Number(form.original_price)
    ? Math.round((1 - Number(form.price) / Number(form.original_price)) * 100)
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
        <div style={{ fontSize: 14, color: "#5f6368", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontWeight: 500 }}>{seller?.business_name || seller?.name}</span>
          <span onClick={handleLogout} style={{ cursor: "pointer", color: "#ea4335" }}>로그아웃</span>
        </div>
      </header>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>셀러 대시보드</h1>
        <p style={{ fontSize: 14, color: "#5f6368", marginBottom: 24 }}>
          상품을 등록하면 AI 에이전트가 소비자에게 추천합니다.
        </p>

        {message && (
          <div style={{
            padding: "12px 16px", borderRadius: 8, marginBottom: 20,
            background: message.ok ? "#e6f4ea" : "#fce8e6",
            color: message.ok ? "#137333" : "#c5221f", fontSize: 14,
          }}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid #e0e0e0" }}>
          {(["products", "add"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "10px 20px", fontSize: 14, fontWeight: tab === t ? 600 : 400,
                border: "none", background: "none", cursor: "pointer",
                borderBottom: tab === t ? "2px solid #1a73e8" : "2px solid transparent",
                color: tab === t ? "#1a73e8" : "#5f6368",
                marginBottom: -2,
              }}
            >
              {t === "products" ? `내 상품 (${products.length})` : "상품 등록"}
            </button>
          ))}
        </div>

        {/* Product List */}
        {tab === "products" && (
          <div>
            {products.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "#5f6368" }}>
                <p style={{ fontSize: 16, marginBottom: 12 }}>등록된 상품이 없습니다</p>
                <button
                  onClick={() => setTab("add")}
                  style={{
                    padding: "10px 24px", fontSize: 14, fontWeight: 500,
                    color: "#fff", background: "#1a73e8", border: "none",
                    borderRadius: 8, cursor: "pointer",
                  }}
                >
                  첫 상품 등록하기
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {products.map(p => (
                  <div key={p.id} style={{
                    display: "flex", gap: 12, padding: 16,
                    border: "1px solid #e0e0e0", borderRadius: 12, alignItems: "center",
                  }}>
                    {p.image_url && (
                      <img
                        src={p.image_url} alt=""
                        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.title}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                        <span style={{ fontWeight: 700 }}>{formatPrice(p.price)}</span>
                        {p.original_price && p.original_price > p.price && (
                          <>
                            <span style={{ color: "#ea4335", fontWeight: 600, fontSize: 13 }}>
                              {Math.round((1 - p.price / p.original_price) * 100)}%
                            </span>
                            <span style={{ textDecoration: "line-through", color: "#9aa0a6", fontSize: 12 }}>
                              {formatPrice(p.original_price)}
                            </span>
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#5f6368", marginTop: 4 }}>
                        {p.category && <span style={{ marginRight: 8 }}>{p.category}</span>}
                        <span style={{
                          color: p.status === "active" ? "#137333" : "#9aa0a6",
                          fontWeight: 500,
                        }}>
                          {p.status === "active" ? "판매중" : "비활성"}
                        </span>
                        {p.stock >= 0 && <span style={{ marginLeft: 8 }}>재고 {p.stock}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteProduct(p.id)}
                      style={{
                        padding: "6px 12px", fontSize: 12, color: "#ea4335",
                        background: "none", border: "1px solid #ea4335",
                        borderRadius: 6, cursor: "pointer", flexShrink: 0,
                      }}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add Product Form */}
        {tab === "add" && (
          <form onSubmit={handleAddProduct}>
            <div className="submit-field">
              <label className="submit-label">상품명 <span className="submit-required">*</span></label>
              <input className="submit-input" name="title" value={form.title} onChange={handleChange} placeholder="예: 삼성 갤럭시 버즈3 프로" required />
            </div>

            <div className="submit-field">
              <label className="submit-label">상품 설명</label>
              <textarea className="submit-textarea" name="description" value={form.description} onChange={handleChange} placeholder="상품 설명" rows={3} />
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              <div className="submit-field" style={{ flex: 1 }}>
                <label className="submit-label">판매가 (원) <span className="submit-required">*</span></label>
                <input className="submit-input" name="price" type="number" min="1" value={form.price} onChange={handleChange} placeholder="0" required />
              </div>
              <div className="submit-field" style={{ flex: 1 }}>
                <label className="submit-label">정가 (원)</label>
                <input className="submit-input" name="original_price" type="number" min="0" value={form.original_price} onChange={handleChange} placeholder="0 (선택)" />
              </div>
            </div>

            {discountRate > 0 && (
              <div style={{ fontSize: 14, color: "#ea4335", fontWeight: 600, marginBottom: 16 }}>
                {discountRate}% 할인
              </div>
            )}

            <div className="submit-field">
              <label className="submit-label">상품 이미지 URL</label>
              <input className="submit-input" name="image_url" type="url" value={form.image_url} onChange={handleChange} placeholder="https://..." />
              {form.image_url && (
                <div style={{ marginTop: 8 }}>
                  <img
                    src={form.image_url} alt="미리보기"
                    style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, border: "1px solid #e0e0e0" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              <div className="submit-field" style={{ flex: 1 }}>
                <label className="submit-label">카테고리</label>
                <select className="submit-input" name="category" value={form.category} onChange={handleChange}>
                  <option value="">선택해주세요</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="submit-field" style={{ flex: 1 }}>
                <label className="submit-label">재고</label>
                <input className="submit-input" name="stock" type="number" min="-1" value={form.stock} onChange={handleChange} placeholder="-1 (무제한)" />
              </div>
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
              {submitting ? "등록 중..." : "상품 등록하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
