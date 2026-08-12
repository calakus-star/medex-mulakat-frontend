import { useState, useEffect } from "react";
import axios from "axios";
import { Card, Input, Select, Button, Alert } from "../components/Layout";
import { API_URL } from "../App";

export default function WalkinPanel({ token }) {
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", position: "", ai_note: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/api/admin/positions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const groups = {};
        res.data.filter(p => p.active).forEach(p => {
          const cat = p.category || "Genel";
          groups[cat] = groups[cat] || [];
          groups[cat].push({ value: p.name, label: p.name });
        });
        setPositions(Object.entries(groups).map(([label, options]) => ({ label, options })));
      });
  }, []);

  const create = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await axios.post(`${API_URL}/api/admin/walkin`, { name: form.name, phone: form.phone, position: form.position, ai_note: form.ai_note, send_email: false }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResult(res.data);
      setForm({ name: "", phone: "", position: "", ai_note: "" });
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
    setLoading(false);
  };

  const mulakatUrl = `${window.location.origin}/mulakat`;

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f", marginBottom: 4 }}>Hızlı Giriş (Walk-in)</div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
        Aday ofiste, mail beklemeden hemen mülakata başlayacaksa kullan.
      </div>
      {error && <Alert>{error}</Alert>}

      {!result ? (
        <>
          <Input label="Ad Soyad" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ahmet Yılmaz" />
          <Input label="Telefon (opsiyonel)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" />
          <Select label="Pozisyon" options={positions} value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} />
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1e3a5f", marginBottom: 6 }}>AI Notu / Özel Talimat (aday görmez, opsiyonel)</label>
            <textarea rows={3} value={form.ai_note} onChange={e => setForm({ ...form, ai_note: e.target.value })} placeholder="Örn. İngilizceyi özellikle ölç. CV'deki Medidata deneyimini doğrula." style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e2e8f0", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }} />
          </div>
          <Button disabled={loading || !form.name || !form.position} onClick={create} style={{ width: "100%" }}>
            {loading ? "Oluşturuluyor..." : "Hesap Oluştur"}
          </Button>
        </>
      ) : (
        <div>
          <Alert type="success">Hesap oluşturuldu, aşağıdaki bilgilerle hemen giriş yapabilir.</Alert>
          <div style={{ background: "#f8fafc", borderRadius: 8, padding: 20, marginBottom: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#64748b" }}>Mülakat Linki</div>
              <div style={{ fontWeight: 600, color: "#1e3a5f" }}>{mulakatUrl}</div>
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              <div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Kullanıcı Adı</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#1e3a5f" }}>{result.username}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Şifre</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: "#1e3a5f" }}>{result.password}</div>
              </div>
            </div>
          </div>
          <Button onClick={() => setResult(null)} style={{ width: "100%" }}>Yeni Walk-in Aday</Button>
        </div>
      )}
    </Card>
  );
}
