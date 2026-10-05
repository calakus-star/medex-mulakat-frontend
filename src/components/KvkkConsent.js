import { useState, useEffect } from "react";
import axios from "axios";
import { API_URL } from "../App";

// İŞ EMRİ — BAŞLANGIÇ EKRANI, KVKK ONAYI, ONAY KAYDI, AI NOTU RAPORU (madde 1/2)
// L1 (Interview.js) ve L2/L3 (RealtimeInterview.js) ortak KVKK onay ekranı.
// Onay kutusu işaretlenmeden "Devam" pasif kalır; onaydan sonra backend'e
// POST /api/consent/accept ile kalıcı onay kaydı yazılır (madde 4).
export default function KvkkConsent({ token, onAccepted }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_URL}/api/consent/current`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (cancelled) return;
        if (res.data.already_given) {
          onAccepted(res.data.tenant_name);
          return;
        }
        setInfo(res.data);
      })
      .catch(() => { if (!cancelled) setError("Aydınlatma metni yüklenemedi. Lütfen sayfayı yenileyin."); });
    return () => { cancelled = true; };
  }, [token]);

  const handleContinue = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await axios.post(`${API_URL}/api/consent/accept`, {}, { headers: { Authorization: `Bearer ${token}` } });
      onAccepted(info?.tenant_name);
    } catch (e) {
      setError("Onayınız kaydedilemedi. Lütfen tekrar deneyin.");
      setSubmitting(false);
    }
  };

  if (error && !info) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ color: "#dc2626", fontSize: 14 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ color: "#71717a", fontSize: 14 }}>Yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#111113", marginBottom: 14, textAlign: "center" }}>Kişisel Verilerin Korunması</div>
        <div style={{ color: "#3f3f46", fontSize: 14, lineHeight: 1.6, marginBottom: 16, textAlign: "center" }}>
          Mülakata devam edebilmeniz için aşağıdaki aydınlatma metnini okumanız ve onay kutusunu işaretlemeniz gerekmektedir.
        </div>
        <button
          type="button"
          onClick={() => setShowFullText(true)}
          style={{ background: "none", border: "none", color: "#2563eb", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "underline", display: "block", margin: "0 auto 16px", padding: 0 }}
        >
          Aydınlatma Metni'ni Görüntüle
        </button>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 8, padding: 14, marginBottom: 18, cursor: "pointer", fontSize: 13, color: "#111113", lineHeight: 1.5 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>{info.checkbox_text}</span>
        </label>
        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button
          type="button"
          disabled={!checked || submitting}
          onClick={handleContinue}
          style={{
            width: "100%", border: "none", borderRadius: 8, padding: "14px 32px", fontSize: 16, fontWeight: 600,
            background: checked ? "#111113" : "#d4d4d8", color: "#fff",
            cursor: checked && !submitting ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Kaydediliyor..." : "Devam"}
        </button>
      </div>

      {showFullText && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}
             onClick={() => setShowFullText(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 640, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}
               onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#111113", marginBottom: 14 }}>Aydınlatma Metni</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7, color: "#3f3f46" }}>{info.disclosure_text}</div>
            <button
              type="button"
              onClick={() => setShowFullText(false)}
              style={{ marginTop: 18, background: "#111113", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const wrapStyle = { minHeight: "100vh", background: "#f7f7f8", display: "flex", flexDirection: "column", alignItems: "center", padding: 24, justifyContent: "center" };
const cardStyle = { width: "100%", maxWidth: 520, background: "#ffffff", borderRadius: 12, padding: 32, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" };
