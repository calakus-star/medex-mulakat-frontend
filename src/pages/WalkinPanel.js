import { useState, useEffect } from "react";
import apiClient, { formatApiError } from "../apiClient";
import { Card, Input, Select, Button, Alert, colors, FONT } from "../components/Layout";
import { API_URL } from "../App";

export default function WalkinPanel({ token }) {
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", position: "", ai_note: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient.get(`${API_URL}/api/admin/positions`, { headers: { Authorization: `Bearer ${token}` } })
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
      const res = await apiClient.post(`${API_URL}/api/admin/walkin`, { name: form.name, phone: form.phone, position: form.position, ai_note: form.ai_note, send_email: false }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResult(res.data);
      setForm({ name: "", phone: "", position: "", ai_note: "" });
    } catch (e) {
      setError(formatApiError(e, "Walk-in kaydı oluşturulamadı").message);
    }
    setLoading(false);
  };

  const mulakatUrl = `${window.location.origin}/mulakat`;

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink, marginBottom: 4 }}>Hızlı Giriş (Walk-in)</div>
      <div style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>
        Aday ofiste, mail beklemeden hemen mülakata başlayacaksa kullan.
      </div>
      {error && <Alert>{error}</Alert>}

      {!result ? (
        <>
          <Input label="Ad Soyad" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ahmet Yılmaz" />
          <Input label="Telefon (opsiyonel)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" />
          <Select label="Pozisyon" options={positions} value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} />
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>AI Notu / Özel Talimat (aday görmez, opsiyonel)</label>
            <textarea rows={3} value={form.ai_note} onChange={e => setForm({ ...form, ai_note: e.target.value })} placeholder="Örn. İngilizceyi özellikle ölç. CV'deki Medidata deneyimini doğrula."
              style={{ width: "100%", padding: "10px 13px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }} />
          </div>
          <Button disabled={loading || !form.name || !form.position} onClick={create} style={{ width: "100%" }}>
            {loading ? "Oluşturuluyor..." : "Hesap Oluştur"}
          </Button>
        </>
      ) : (
        <div>
          <Alert type="success">Hesap oluşturuldu, aşağıdaki bilgilerle hemen giriş yapabilir.</Alert>
          <div style={{ background: colors.surfaceAlt, borderRadius: 8, padding: 20, marginBottom: 16 }}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: colors.muted }}>Mülakat Linki</div>
              <div style={{ fontWeight: 600, color: colors.ink }}>{mulakatUrl}</div>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: colors.muted }}>Kullanıcı Adı</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: colors.ink }}>{result.username}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: colors.muted }}>Şifre</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: colors.ink }}>{result.password}</div>
              </div>
            </div>
          </div>
          <Button onClick={() => setResult(null)} style={{ width: "100%" }}>Yeni Walk-in Aday</Button>
        </div>
      )}
    </Card>
  );
}
