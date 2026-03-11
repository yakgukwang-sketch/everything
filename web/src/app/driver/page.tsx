"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  API_URL, DeliveryOrder, DriverBid, Driver, DELIVERY_STATUS, formatPrice, timeAgo,
} from "@/lib/shared";

type JobWithBids = DeliveryOrder & {
  my_bid?: DriverBid;
  bid_count: number;
  offered_fee?: number;
  agent_name?: string;
  store_name?: string;
};

export default function DriverPage() {
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [jobs, setJobs] = useState<JobWithBids[]>([]);
  const [myDeliveries, setMyDeliveries] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"available" | "my" | "register">("available");

  // Registration form
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regArea, setRegArea] = useState("부천");
  const [regVehicle, setRegVehicle] = useState("motorcycle");
  const [regLoading, setRegLoading] = useState(false);


  // Check localStorage for driver ID
  useEffect(() => {
    const driverId = localStorage.getItem("driver_id");
    if (driverId) {
      fetchDriver(driverId);
    } else {
      setTab("register");
    }
  }, []);

  const fetchDriver = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/drivers/${id}`);
      const data = await res.json();
      if (data.success && data.data) {
        setDriver(data.data);
        loadJobs(data.data.area, data.data.id);
        loadMyDeliveries(id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadJobs = useCallback(async (area: string, driverId?: number) => {
    setLoading(true);
    try {
      const did = driverId || driver?.id || 0;
      if (!did) { setLoading(false); return; }
      const res = await fetch(`${API_URL}/api/drivers/${did}/jobs?area=${encodeURIComponent(area)}&status=driver_bidding`);
      const data = await res.json();
      setJobs(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [driver]);

  const loadMyDeliveries = async (driverId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/drivers/${driverId}/jobs?status=delivering`);
      const data = await res.json();
      setMyDeliveries(data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone.trim()) return;
    setRegLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/drivers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          phone: regPhone.trim(),
          area: regArea,
          vehicle_type: regVehicle,
        }),
      });
      const data = await res.json();
      if (data.success && data.driver_id) {
        localStorage.setItem("driver_id", String(data.driver_id));
        fetchDriver(String(data.driver_id));
        setTab("available");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRegLoading(false);
    }
  };

  const handleAccept = async (orderId: number) => {
    if (!driver) return;
    try {
      const res = await fetch(`${API_URL}/api/delivery/${orderId}/driver-bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: driver.id,
          estimated_time: 30,
          message: "30분 내 배달 가능합니다",
        }),
      });
      const data = await res.json();
      if (data.success) {
        loadJobs(driver.area);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = (orderId: number) => {
    setJobs(prev => prev.filter(j => j.id !== orderId));
  };

  const handleComplete = async (orderId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/delivery/${orderId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success && driver) {
        loadMyDeliveries(String(driver.id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const AREAS = ["부천", "인천", "서울", "수원", "성남", "안양", "고양", "용인", "화성", "시흥"];
  const VEHICLES: Record<string, string> = {
    motorcycle: "오토바이",
    bicycle: "자전거",
    car: "자동차",
    walk: "도보",
  };

  return (
    <div className="driver-page">
      <header className="driver-header">
        <div className="driver-header-left" onClick={() => router.push("/")} style={{ cursor: "pointer" }}>
          <span className="driver-logo">
            <span style={{ color: "#4285f4" }}>e</span><span style={{ color: "#ea4335" }}>v</span><span>e</span>
            <span style={{ color: "#4285f4" }}>r</span><span style={{ color: "#34a853" }}>y</span><span>t</span>
            <span style={{ color: "#fbbc05" }}>h</span><span>i</span><span style={{ color: "#ea4335" }}>n</span>
            <span style={{ color: "#4285f4" }}>g</span>
          </span>
          <span className="driver-badge">DRIVER</span>
        </div>
        {driver && (
          <div className="driver-profile-mini">
            <span className="driver-status-dot" />
            <span>{driver.name}</span>
            <span className="driver-area-tag">{driver.area}</span>
          </div>
        )}
      </header>

      {/* Tabs */}
      {driver && (
        <div className="driver-tabs">
          <button className={`driver-tab ${tab === "available" ? "active" : ""}`} onClick={() => { setTab("available"); loadJobs(driver.area); }}>
            배달 요청 ({jobs.length})
          </button>
          <button className={`driver-tab ${tab === "my" ? "active" : ""}`} onClick={() => { setTab("my"); loadMyDeliveries(String(driver.id)); }}>
            내 배달 ({myDeliveries.length})
          </button>
        </div>
      )}

      <div className="driver-content">
        {/* Registration */}
        {tab === "register" && !driver && (
          <div className="driver-register">
            <div className="register-card">
              <h2>기사 등록</h2>
              <p>배달 기사로 등록하고 수익을 올려보세요</p>
              <form onSubmit={handleRegister}>
                <div className="form-group">
                  <label>이름</label>
                  <input type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="홍길동" required />
                </div>
                <div className="form-group">
                  <label>전화번호</label>
                  <input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="010-1234-5678" required />
                </div>
                <div className="form-group">
                  <label>활동 지역</label>
                  <select value={regArea} onChange={e => setRegArea(e.target.value)}>
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>이동 수단</label>
                  <div className="vehicle-options">
                    {Object.entries(VEHICLES).map(([k, v]) => (
                      <button key={k} type="button" className={`vehicle-btn ${regVehicle === k ? "active" : ""}`} onClick={() => setRegVehicle(k)}>
                        {k === "motorcycle" ? "🏍️" : k === "bicycle" ? "🚴" : k === "car" ? "🚗" : "🚶"} {v}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="submit" className="register-submit" disabled={regLoading}>
                  {regLoading ? "등록중..." : "기사 등록하기"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Available Jobs */}
        {tab === "available" && driver && (
          <div className="driver-jobs">
            <div className="jobs-header">
              <h2>{driver.area} 지역 배달 요청</h2>
              <button className="refresh-btn" onClick={() => loadJobs(driver.area)}>새로고침</button>
            </div>

            {loading ? (
              <div className="loading">
                <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
              </div>
            ) : jobs.length > 0 ? (
              <div className="job-list">
                {jobs.map(job => (
                  <div key={job.id} className="job-card">
                    <div className="job-top">
                      <div className="job-info">
                        <div className="job-request">{job.consumer_request}</div>
                        <div className="job-meta">
                          <span className="job-area">{job.area}</span>
                          <span className="job-food">{job.food_type}</span>
                          <span className="job-qty">{job.quantity}</span>
                        </div>
                        <div className="job-meta" style={{ marginTop: 4 }}>
                          {job.agent_name && <span className="job-area" style={{ background: "#e8f0fe", color: "#4285f4" }}>🤖 {job.agent_name}</span>}
                          {job.store_name && <span className="job-area" style={{ background: "#fef7e0", color: "#f9a825" }}>🏪 {job.store_name}</span>}
                          <span className="job-budget" style={{ color: "#34a853", fontWeight: 700 }}>배달비 {formatPrice(job.offered_fee || 0)}</span>
                        </div>
                      </div>
                      <div className="job-time">{timeAgo(job.created_at)}</div>
                    </div>

                    <div className="job-status-bar">
                      <span className="status-badge" style={{ background: DELIVERY_STATUS[job.status]?.color || "#9e9e9e" }}>
                        {DELIVERY_STATUS[job.status]?.label || job.status}
                      </span>
                      <span className="bid-count">입찰 {job.bid_count || 0}건</span>
                    </div>

                    <div className="bid-form-actions" style={{ marginTop: 8 }}>
                      <button className="bid-submit" style={{ background: "#34a853", flex: 1 }} onClick={() => handleAccept(job.id)}>수락</button>
                      <button className="bid-cancel" style={{ background: "#ea4335", color: "#fff", flex: 1 }} onClick={() => handleReject(job.id)}>거절</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-jobs">
                <div className="empty-icon">🛵</div>
                <p>현재 {driver.area} 지역에 배달 요청이 없습니다</p>
                <p className="empty-sub">새로운 요청이 들어오면 여기에 표시됩니다</p>
              </div>
            )}
          </div>
        )}

        {/* My Deliveries */}
        {tab === "my" && driver && (
          <div className="driver-my-deliveries">
            <h2>내 배달</h2>
            {myDeliveries.length > 0 ? (
              <div className="job-list">
                {myDeliveries.map(order => (
                  <div key={order.id} className="job-card active-delivery">
                    <div className="job-top">
                      <div className="job-info">
                        <div className="job-request">{order.consumer_request}</div>
                        <div className="job-meta">
                          <span className="job-area">{order.area}</span>
                          <span className="job-food">{order.food_type}</span>
                        </div>
                      </div>
                      <span className="status-badge" style={{ background: DELIVERY_STATUS[order.status]?.color || "#9e9e9e" }}>
                        {DELIVERY_STATUS[order.status]?.label || order.status}
                      </span>
                    </div>
                    {order.status === "delivering" && (
                      <button className="complete-btn" onClick={() => handleComplete(order.id)}>
                        배달 완료
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-jobs">
                <div className="empty-icon">📦</div>
                <p>진행중인 배달이 없습니다</p>
              </div>
            )}

            {/* Stats */}
            <div className="driver-stats">
              <div className="stat-card">
                <div className="stat-num">{driver.total_deliveries ?? 0}</div>
                <div className="stat-label">총 배달</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{(driver.rating ?? 0).toFixed(1)}</div>
                <div className="stat-label">평점</div>
              </div>
              <div className="stat-card">
                <div className="stat-num">{driver.review_count ?? 0}</div>
                <div className="stat-label">리뷰</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
