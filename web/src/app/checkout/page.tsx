"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL, formatPrice } from "@/lib/shared";
import type { SellerProduct } from "@/lib/shared";

type OrderResult = {
  order_number: string;
  product_title: string;
  seller_name: string;
  product_price: number;
  agent_fee: number;
  total_price: number;
  status: string;
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="results-page"><div style={{ textAlign: "center", padding: 80, color: "#5f6368" }}>로딩 중...</div></div>}>
      <CheckoutContent />
    </Suspense>
  );
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("product_id");
  const agentId = searchParams.get("agent_id");
  const agentFeeParam = searchParams.get("agent_fee");

  const [product, setProduct] = useState<SellerProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    buyer_name: "",
    buyer_phone: "",
    buyer_email: "",
    buyer_address: "",
    memo: "",
  });

  const agentFee = agentFeeParam ? parseInt(agentFeeParam) : 0;

  useEffect(() => {
    if (!productId) {
      setError("상품 정보가 없습니다");
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/api/products/${productId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setProduct(data.product);
        else setError("상품을 찾을 수 없습니다");
      })
      .catch(() => setError("서버 연결에 실패했습니다"))
      .finally(() => setLoading(false));
  }, [productId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: Number(productId),
          agent_id: agentId || undefined,
          agent_fee: agentFee,
          ...form,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setOrderResult(data.order);
      } else {
        setError(data.error);
      }
    } catch {
      setError("주문에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPrice = product ? product.price + agentFee : 0;
  const discountRate = product?.original_price && product.original_price > product.price
    ? Math.round((1 - product.price / product.original_price) * 100)
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
          <span style={{ color: "#1a73e8", fontWeight: 600 }}>주문하기</span>
        </div>
      </header>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px" }}>

        {/* 주문 완료 */}
        {orderResult && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>주문이 완료되었습니다!</h1>
            <p style={{ fontSize: 14, color: "#5f6368", marginBottom: 24 }}>
              셀러가 주문을 확인하면 안내 연락을 드립니다.
            </p>

            <div style={{
              padding: 20, borderRadius: 12, background: "#f8f9fa",
              border: "1px solid #e0e0e0", textAlign: "left", marginBottom: 24,
            }}>
              <div style={{ fontSize: 13, color: "#5f6368", marginBottom: 12 }}>주문 정보</div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                <strong>주문번호:</strong> {orderResult.order_number}
              </div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                <strong>상품:</strong> {orderResult.product_title}
              </div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>
                <strong>판매자:</strong> {orderResult.seller_name}
              </div>
              <div style={{ fontSize: 14, marginBottom: 4 }}>
                <strong>상품가:</strong> {formatPrice(orderResult.product_price)}
              </div>
              {orderResult.agent_fee > 0 && (
                <div style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>에이전트 수수료:</strong> {formatPrice(orderResult.agent_fee)}
                </div>
              )}
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, color: "#1a73e8" }}>
                총 결제금액: {formatPrice(orderResult.total_price)}
              </div>
            </div>

            <button
              onClick={() => router.push("/")}
              style={{
                padding: "12px 32px", fontSize: 14, fontWeight: 500,
                color: "#fff", background: "#1a73e8", border: "none",
                borderRadius: 8, cursor: "pointer",
              }}
            >
              홈으로 돌아가기
            </button>
          </div>
        )}

        {/* 로딩 */}
        {loading && !orderResult && (
          <div style={{ textAlign: "center", padding: 80, color: "#5f6368" }}>상품 정보 불러오는 중...</div>
        )}

        {/* 에러 */}
        {error && !orderResult && (
          <div style={{
            padding: "14px 20px", borderRadius: 12, marginBottom: 24,
            background: "#fce8e6", color: "#c5221f", fontSize: 14, fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        {/* 주문 폼 */}
        {product && !orderResult && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>주문하기</h1>

            {/* 상품 요약 */}
            <div style={{
              display: "flex", gap: 16, padding: 16,
              border: "1px solid #e0e0e0", borderRadius: 12, marginBottom: 24,
            }}>
              {product.image_url && (
                <img
                  src={product.image_url} alt=""
                  style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div>
                {product.seller_name && (
                  <div style={{ fontSize: 12, color: "#5f6368", marginBottom: 4 }}>{product.seller_name}</div>
                )}
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{product.title}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {discountRate > 0 && (
                    <span style={{ color: "#ea4335", fontWeight: 700 }}>{discountRate}%</span>
                  )}
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{formatPrice(product.price)}</span>
                  {product.original_price && product.original_price > product.price && (
                    <span style={{ textDecoration: "line-through", color: "#9aa0a6", fontSize: 13 }}>
                      {formatPrice(product.original_price)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 가격 상세 */}
            <div style={{
              padding: 16, borderRadius: 12, background: "#f8f9fa",
              border: "1px solid #e0e0e0", marginBottom: 24, fontSize: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span>상품가</span>
                <span>{formatPrice(product.price)}</span>
              </div>
              {agentFee > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#5f6368" }}>
                  <span>에이전트 수수료</span>
                  <span>{formatPrice(agentFee)}</span>
                </div>
              )}
              <div style={{
                display: "flex", justifyContent: "space-between",
                paddingTop: 8, borderTop: "1px solid #e0e0e0",
                fontWeight: 700, fontSize: 16, color: "#1a73e8",
              }}>
                <span>총 결제금액</span>
                <span>{formatPrice(totalPrice)}</span>
              </div>
            </div>

            {/* 주문자 정보 */}
            <form onSubmit={handleSubmit}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>주문자 정보</h2>

              <div className="submit-field">
                <label className="submit-label">이름 <span className="submit-required">*</span></label>
                <input className="submit-input" name="buyer_name" value={form.buyer_name} onChange={handleChange} placeholder="홍길동" required />
              </div>

              <div className="submit-field">
                <label className="submit-label">전화번호 <span className="submit-required">*</span></label>
                <input className="submit-input" name="buyer_phone" value={form.buyer_phone} onChange={handleChange} placeholder="010-1234-5678" required />
              </div>

              <div className="submit-field">
                <label className="submit-label">이메일</label>
                <input className="submit-input" name="buyer_email" type="email" value={form.buyer_email} onChange={handleChange} placeholder="email@example.com" />
              </div>

              <div className="submit-field">
                <label className="submit-label">배송지 주소</label>
                <input className="submit-input" name="buyer_address" value={form.buyer_address} onChange={handleChange} placeholder="서울시 강남구..." />
              </div>

              <div className="submit-field">
                <label className="submit-label">메모</label>
                <textarea className="submit-textarea" name="memo" value={form.memo} onChange={handleChange} placeholder="요청사항 (선택)" rows={2} />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%", padding: "16px", fontSize: 16, fontWeight: 700,
                  color: "#fff", background: submitting ? "#9aa0a6" : "#1a73e8",
                  border: "none", borderRadius: 12, cursor: submitting ? "not-allowed" : "pointer",
                  marginTop: 8,
                }}
              >
                {submitting ? "주문 처리 중..." : `${formatPrice(totalPrice)} 주문하기`}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
