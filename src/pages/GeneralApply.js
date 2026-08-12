import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { Header, Card, Input, Select, Button, Alert } from "../components/Layout";
import { API_URL } from "../App";

const fieldStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const mobileHint = { fontSize: 12, color: "#64748b", marginTop: -8, marginBottom: 12 };

export default function GeneralApply() {
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", position: "", education: "",
    university: "", department: "", experience_years: 0, ai_note: ""
  });
  const [cvFile, setCvFile] = useState(null);
  const [skipCv, setSkipCv] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/api/positions`).then(res => {
      if (res.data.groups) {
        setPositions(Object.entries(res.data.groups).map(([group, items]) => ({
          label: group,
          options: items.map(p => ({ value: p, label: p }))
        })));
      } else {
        setPositions((res.data.positions || []).map(p => ({ value: p, label: p })));
      }
    });
  }, []);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const apply = async () => {
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ""));
      fd.set("experience_years", parseInt(form.experience_years || 0, 10));
      if (cvFile && !skipCv) fd.append("cv_file", cvFile);
      await axios.post(`${API_URL}/api/apply`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSuccess(true);
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", flexDirection: "column", alignItems: "center", padding: 16 }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <Header subtitle="Başvuru Sistemi" />
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e3a5f", marginBottom: 8 }}>Başvurunuz Alındı!</div>
            <div style={{ color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
              Giriş bilgileriniz <strong>{form.email}</strong> adresine gönderildi.<br />
              Mailinizi kontrol ederek mülakata başlayabilirsiniz.
            </div>
            <Link to="/mulakat"><Button style={{ width: "100%" }}>Mülakata Git</Button></Link>
          </Card>
        </div>
      </div>
    );
  }

  const isValid = form.name && form.email && form.phone && form.position && form.education;

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", flexDirection: "column", alignItems: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        <Header subtitle="İş Başvurusu" />
        <Card>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e3a5f", marginBottom: 4 }}>MedeX SMO Başvuru Formu</div>
            <div style={{ color: "#64748b", fontSize: 14 }}>Eğitim bilgisi zorunludur. CV isteğe bağlıdır; daha sonra da eklenebilir.</div>
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="apply-grid" style={fieldStyle}>
            <div style={{ gridColumn: "1 / -1" }}><Input label="Ad Soyad *" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ahmet Yılmaz" /></div>
            <Input label="E-posta *" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="ahmet@email.com" />
            <Input label="Telefon *" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="05xx xxx xx xx" />
            <div style={{ gridColumn: "1 / -1" }}><Select label="Başvurduğunuz Pozisyon *" options={positions} value={form.position} onChange={e => set("position", e.target.value)} /></div>
            <Input label="Eğitim Durumu *" value={form.education} onChange={e => set("education", e.target.value)} placeholder="Lisans / Yüksek Lisans / Tıp / Doktora" />
            <Input label="Üniversite" value={form.university} onChange={e => set("university", e.target.value)} placeholder="Hacettepe Üniversitesi" />
            <Input label="Bölüm" value={form.department} onChange={e => set("department", e.target.value)} placeholder="Biyoloji / Tıp / Hemşirelik" />
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1e3a5f", marginBottom: 6 }}>Deneyim (Yıl)</label>
              <select value={form.experience_years} onChange={e => set("experience_years", e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e2e8f0", fontSize: 14, background: "#fff" }}>
                <option value={0}>Deneyim yok</option><option value={1}>1 yıldan az</option><option value={2}>1-3 yıl</option><option value={5}>3-5 yıl</option><option value={6}>5+ yıl</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1e3a5f", marginBottom: 6 }}>CV (opsiyonel)</label>
              <input disabled={skipCv} type="file" accept=".pdf,.docx" onChange={e => setCvFile(e.target.files?.[0] || null)} style={{ width: "100%", padding: 12, borderRadius: 8, border: "2px solid #e2e8f0", background: skipCv ? "#f8fafc" : "#fff" }} />
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13, color: "#64748b" }}>
                <input type="checkbox" checked={skipCv} onChange={e => { setSkipCv(e.target.checked); if (e.target.checked) setCvFile(null); }} />
                CV'yi daha sonra yükleyeceğim.
              </label>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1e3a5f", marginBottom: 6 }}>Ek Not (opsiyonel)</label>
              <textarea value={form.ai_note} onChange={e => set("ai_note", e.target.value)} placeholder="Örn. İngilizce seviyemi özellikle değerlendirin, belirli deneyimimi anlatmak istiyorum..." rows={3} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e2e8f0", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }} />
              <div style={mobileHint}>Bu not adayın kendi açıklaması olarak kaydedilir; admin daha sonra özel AI notu ekleyebilir.</div>
            </div>
          </div>
          <Button style={{ width: "100%", marginTop: 8 }} disabled={loading || !isValid} onClick={apply}>{loading ? "Gönderiliyor..." : "Başvur"}</Button>
          <div style={{ textAlign: "center", marginTop: 16, color: "#64748b", fontSize: 13 }}>Zaten davet aldınız mı? <Link to="/mulakat" style={{ color: "#1e3a5f", fontWeight: 600 }}>Giriş Yap</Link></div>
        </Card>
      </div>
    </div>
  );
}
