import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Header, Card, Input, Select, Button, Alert } from "../components/Layout";
import { API_URL } from "../App";
import PositionManager from "./PositionManager";
import WalkinPanel from "./WalkinPanel";

const STATUS_LABELS = {
  pending: { label: "Bekliyor", color: "#f59e0b", bg: "#fffbeb" },
  completed: { label: "Tamamlandı", color: "#22c55e", bg: "#f0fdf4" },
};

const REC_COLORS = {
  "İşe Al": "#22c55e",
  "Değerlendirmeye Al": "#f59e0b",
  "Reddet": "#ef4444",
};

const formatScore = (value) => (value === null || value === undefined || value === "" ? "-" : `${value}/100`);

const normalizeRecommendation = (score, recommendation) => {
  if (score === null || score === undefined || score === "") return recommendation || "-";
  const n = Number(score);
  if (Number.isNaN(n)) return recommendation || "-";
  if (n < 40) return "Reddet";
  if (n < 60) return "Değerlendirmeye Al";
  if (n < 80) return "Değerlendirmeye Al";
  return "İşe Al";
};

const stripMarkdown = (value = "") => value
  .replace(/\*\*/g, "")
  .replace(/^\s*[-*]\s+/gm, "• ")
  .replace(/---RAPOR---|---RAPORSON---|---STANDARTCV---|---STANDARTCVSON---/g, "")
  .trim();

function ReportText({ text }) {
  const clean = stripMarkdown(text || "Rapor bulunamadı.");
  const lines = clean.split("\n").filter(Boolean);
  return (
    <div style={{ background: "#f8fafc", borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.65, marginBottom: 20 }}>
      {lines.map((line, idx) => {
        const isTitle = line.endsWith(":") || line.startsWith("TOPLAM PUAN") || line.startsWith("Öneri:");
        return <div key={idx} style={{ marginBottom: 6, fontWeight: isTitle ? 700 : 400, color: isTitle ? "#1e3a5f" : "#0f172a", whiteSpace: "pre-wrap" }}>{line}</div>;
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const [candidates, setCandidates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", positionGroup: "", position: "", level: 1, depth_tier: "standart", interview_language: "tr", report_language: "tr", education: "", university: "", department: "", experience_years: 0, ai_note: "" });
  const [adminCvFile, setAdminCvFile] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [tab, setTab] = useState("candidates");
  const [positionsRaw, setPositionsRaw] = useState([]);
  const [credModal, setCredModal] = useState(null);
  const navigate = useNavigate();

  const token = localStorage.getItem("admin_token");

  useEffect(() => {
    if (!token) { navigate("/admin"); return; }
    fetchCandidates();
    axios.get(`${API_URL}/api/admin/positions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const list = (Array.isArray(res.data) ? res.data : []).filter(p => p.active);
        setPositionsRaw(list);
      });
  }, []);

  // Grup (kategori) -> Pozisyon bağımlı combo yardımcıları
  const groupOptions = Array.from(new Set(positionsRaw.map(p => p.category || "Genel"))).map(c => ({ value: c, label: c }));
  const positionOptionsForGroup = (group) => positionsRaw.filter(p => (p.category || "Genel") === group).map(p => ({ value: p.name, label: p.name }));
  const findGroupForPosition = (positionName) => {
    const found = positionsRaw.find(p => p.name === positionName);
    return found ? (found.category || "Genel") : "";
  };

  const fetchCandidates = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/candidates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCandidates(Array.isArray(res.data) ? res.data.filter(c => !c.is_archived) : []);
    } catch (e) {
      if (e.response?.status === 401) { navigate("/admin"); }
    }
  };

  const startEdit = (c) => {
    setForm({
      name: c.name || "", email: c.email || "", phone: c.phone || "",
      positionGroup: findGroupForPosition(c.position || ""), position: c.position || "",
      level: c.level || 1, depth_tier: c.depth_tier || "standart", interview_language: c.interview_language || "tr", report_language: c.report_language || "tr",
      education: c.education || "", university: c.university || "", department: c.department || "",
      experience_years: c.experience_years || 0, ai_note: c.ai_note || ""
    });
    setEditingId(c.id);
    setShowForm(true);
    setError(""); setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ name: "", email: "", phone: "", positionGroup: "", position: "", level: 1, depth_tier: "standart", interview_language: "tr", report_language: "tr", education: "", university: "", department: "", experience_years: 0, ai_note: "" });
  };

  const updateCandidate = async () => {
    setLoading(true); setError(""); setSuccess("");
    try {
      await axios.patch(`${API_URL}/api/admin/candidates/${editingId}`, form, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (adminCvFile) {
        const fd = new FormData();
        fd.append("file", adminCvFile);
        await axios.post(`${API_URL}/api/admin/candidates/${editingId}/upload-cv`, fd, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
        });
      }
      setSuccess("✅ Aday bilgileri güncellendi.");
      cancelForm();
      setAdminCvFile(null);
      fetchCandidates();
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
    setLoading(false);
  };

  const createCandidate = async () => {
    setLoading(true); setError(""); setSuccess("");
    try {
      const res = await axios.post(`${API_URL}/api/admin/candidates`, form, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (adminCvFile) {
        const fd = new FormData();
        fd.append("file", adminCvFile);
        await axios.post(`${API_URL}/api/admin/candidates/${res.data.id}/upload-cv`, fd, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
        });
      }
      if (res.data.mail_sent) {
        setSuccess(`✅ Aday eklendi. Kullanıcı: ${res.data.username} | Şifre: ${res.data.password} | Davet maili gönderildi.`);
      } else {
        setSuccess(`⚠️ Aday eklendi ama davet maili gönderilemedi. Kullanıcı: ${res.data.username} | Şifre: ${res.data.password} — bu bilgileri adaya manuel iletmeniz gerekiyor.`);
      }
      cancelForm();
      setAdminCvFile(null);
      fetchCandidates();
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
    setLoading(false);
  };

  const resendAsNew = async () => {
    if (!window.confirm("Bu adayın mevcut bilgileriyle yeni bir davet gönderilecek. Devam edilsin mi?")) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      const res = await axios.post(`${API_URL}/api/admin/candidates`, { ...form, _force: true }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (adminCvFile) {
        const fd = new FormData();
        fd.append("file", adminCvFile);
        await axios.post(`${API_URL}/api/admin/candidates/${res.data.id}/upload-cv`, fd, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
        });
      }
      if (res.data.mail_sent) {
        setSuccess(`✅ Yeni davet gönderildi. Kullanıcı: ${res.data.username} | Şifre: ${res.data.password}`);
      } else {
        setSuccess(`⚠️ Yeni davet oluşturuldu ama mail gönderilemedi. Kullanıcı: ${res.data.username} | Şifre: ${res.data.password} — bu bilgileri adaya manuel iletmeniz gerekiyor.`);
      }
      cancelForm();
      setAdminCvFile(null);
      fetchCandidates();
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
    setLoading(false);
  };

  const [snapshots, setSnapshots] = useState([]);

  const [modalError, setModalError] = useState("");

  const viewReport = async (candidateId) => {
    setModalError("");
    try {
      const res = await axios.get(`${API_URL}/api/admin/interviews/${candidateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedReport(res.data);
      try {
        const snapRes = await axios.get(`${API_URL}/api/admin/snapshots/${candidateId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSnapshots(snapRes.data || []);
      } catch (e) {
        setSnapshots([]);
        const detail = e.response?.data?.detail || "Kamera kareleri yüklenemedi";
        setModalError(detail);
      }
    } catch (e) {
      alert("Rapor bulunamadı");
    }
  };

  const downloadPdf = async (candidateId, candidateName = "aday") => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/interviews/${candidateId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `MedeX_Rapor_${candidateName.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      let detail = "PDF rapor indirilemedi";
      try {
        if (e.response?.data instanceof Blob) {
          const text = await e.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed?.detail) detail = parsed.detail;
        } else if (e.response?.data?.detail) {
          detail = e.response.data.detail;
        }
      } catch (parseErr) { /* yoksay, genel mesaj kalır */ }
      setError(detail);
      setModalError(detail);
    }
  };

  const resendInvite = async (candidateId) => {
    try {
      const res = await axios.post(`${API_URL}/api/admin/candidates/${candidateId}/resend`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.mail_sent) {
        setSuccess(`✅ Mail tekrar gönderildi. Kullanıcı: ${res.data.username}`);
      } else {
        setCredModal({ username: res.data.username, password: res.data.password });
      }
      fetchCandidates();
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
  };

  const showCredentials = async (candidateId) => {
    try {
      const res = await axios.post(`${API_URL}/api/admin/candidates/${candidateId}/show-credentials`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCredModal({ username: res.data.username, password: res.data.password });
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
  };

  const resetPassword = async (candidateId) => {
    if (!window.confirm("Şifreyi sıfırlamak istediğine emin misin? Eski şifre geçersiz olacak.")) return;
    try {
      const res = await axios.post(`${API_URL}/api/admin/candidates/${candidateId}/reset-password`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCredModal({ username: res.data.username, password: res.data.password });
    } catch (e) {
      setError("Hata oluştu");
    }
  };

  const deleteCandidate = async (candidateId, name) => {
    if (!window.confirm(`${name} adlı adayı silmek istediğine emin misin? Bu işlem geri alınamaz.`)) return;
    try {
      await axios.delete(`${API_URL}/api/admin/candidates/${candidateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(`✅ ${name} silindi`);
      fetchCandidates();
    } catch (e) {
      setError("Silme işlemi başarısız");
    }
  };

  const toggleReapply = async (candidateId) => {
    try {
      const res = await axios.post(`${API_URL}/api/admin/candidates/${candidateId}/allow-reapply`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(res.data.reapply_allowed ? "✅ Tekrar başvuru izni açıldı" : "✅ Tekrar başvuru izni kapatıldı");
      fetchCandidates();
    } catch (e) {
      setError(e.response?.data?.detail || "Tekrar başvuru izni güncellenemedi");
    }
  };

  const stats = {
    total: candidates.length,
    pending: candidates.filter(c => c.status === "pending").length,
    completed: candidates.filter(c => c.status === "completed").length,
    hireCount: candidates.filter(c => c.recommendation === "İşe Al").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ background: "#1e3a5f", padding: "12px 24px", borderRadius: 12, flex: 1, marginRight: 16 }}>
            <div style={{ color: "#7eb8f7", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>MedeX SMO</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Admin Paneli</div>
          </div>
          <Button variant="secondary" onClick={() => { localStorage.removeItem("admin_token"); navigate("/admin"); }}>
            Çıkış
          </Button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Toplam Aday", value: stats.total, color: "#1e3a5f" },
            { label: "Bekleyen", value: stats.pending, color: "#f59e0b" },
            { label: "Tamamlanan", value: stats.completed, color: "#22c55e" },
            { label: "İşe Al Önerisi", value: stats.hireCount, color: "#7eb8f7" },
          ].map((s, i) => (
            <Card key={i} style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { key: "candidates", label: "Adaylar" },
            { key: "positions", label: "Pozisyonlar" },
            { key: "walkin", label: "Hızlı Giriş" },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: tab === t.key ? "#1e3a5f" : "#fff",
                color: tab === t.key ? "#fff" : "#1e3a5f",
                border: tab === t.key ? "none" : "2px solid #e2e8f0",
                borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "positions" && <PositionManager token={token} />}
        {tab === "walkin" && <WalkinPanel token={token} />}
        {tab === "candidates" && (
        <>
        {success && <Alert type="success">{success}</Alert>}
        {error && <Alert>{error}</Alert>}

        {/* Add candidate */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showForm ? 20 : 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f" }}>{editingId ? "Aday Düzenle" : "Aday Davet Et"}</div>
            <Button onClick={() => showForm ? cancelForm() : setShowForm(true)}>
              {showForm ? "İptal" : "+ Yeni Aday"}
            </Button>
          </div>
          {showForm && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Ad Soyad" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ahmet Yılmaz" />
              <Input label="E-posta" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ahmet@email.com" />
              <Input label="Telefon (opsiyonel)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" />
              <Select
                label="Grup"
                options={groupOptions}
                value={form.positionGroup}
                onChange={e => setForm({ ...form, positionGroup: e.target.value, position: "" })}
              />
              <Select
                label="Pozisyon"
                options={positionOptionsForGroup(form.positionGroup)}
                value={form.position}
                onChange={e => setForm({ ...form, position: e.target.value })}
                disabled={!form.positionGroup}
              />
              <Select
                label="Mülakat Seviyesi"
                options={[
                  { value: 1, label: "Level 1 — 10 dk, metin bazlı, CV opsiyonel" },
                  { value: 2, label: "Level 2 — 20 dk, CV zorunlu" },
                  { value: 3, label: "Level 3 — 30+ dk (adaptif), CV zorunlu" },
                ]}
                value={form.level}
                onChange={e => setForm({ ...form, level: parseInt(e.target.value, 10) })}
              />
              <Select
                label="Derinlik Seviyesi"
                options={[
                  { value: "kisa", label: "Kısa — hedeften daha az (ucuz/test amaçlı da kullanılabilir)" },
                  { value: "standart", label: "Standart — level'ın kendi baz süresine yakın" },
                  { value: "derin", label: "Derin — hedeften belirgin şekilde daha uzun" },
                ]}
                value={form.depth_tier}
                onChange={e => setForm({ ...form, depth_tier: e.target.value })}
              />
              {form.level >= 2 && !adminCvFile && !editingId && (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#b45309", background: "#fef9e7", border: "1px solid #f59e0b", borderRadius: 6, padding: "8px 10px" }}>
                  Bu seviyede aday CV yüklemeden mülakata başlayamaz. Adayı davet ederken CV'yi buradan yükleyebilir veya adayın kendi yüklemesini bekleyebilirsiniz.
                </div>
              )}
              <Select
                label="Mülakat Dili"
                options={[
                  { value: "tr", label: "Türkçe" },
                  { value: "en", label: "İngilizce" },
                  { value: "de", label: "Almanca" },
                ]}
                value={form.interview_language}
                onChange={e => setForm({ ...form, interview_language: e.target.value })}
              />
              <Select
                label="Rapor Dili"
                options={[
                  { value: "tr", label: "Türkçe" },
                  { value: "en", label: "İngilizce" },
                  { value: "de", label: "Almanca" },
                ]}
                value={form.report_language}
                onChange={e => setForm({ ...form, report_language: e.target.value })}
              />
              {form.interview_language !== form.report_language && (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#1e40af", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "8px 10px" }}>
                  Not: Mülakat {form.interview_language === "tr" ? "Türkçe" : form.interview_language === "en" ? "İngilizce" : "Almanca"} yapılacak, ama rapor {form.report_language === "tr" ? "Türkçe" : form.report_language === "en" ? "İngilizce" : "Almanca"} yazılacak.
                </div>
              )}
              <Select
                label="Eğitim Seviyesi"
                options={[
                  { value: "Lise", label: "Lise" },
                  { value: "Ön Lisans", label: "Ön Lisans" },
                  { value: "Lisans", label: "Lisans" },
                  { value: "Yüksek Lisans", label: "Yüksek Lisans" },
                  { value: "Doktora", label: "Doktora" },
                ]}
                value={form.education}
                onChange={e => setForm({ ...form, education: e.target.value })}
              />
              <Input label="Üniversite" value={form.university} onChange={e => setForm({ ...form, university: e.target.value })} placeholder="Üniversite" />
              <Input label="Bölüm" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Bölüm" />
              <Input label="Deneyim yılı" type="number" min="0" value={form.experience_years} onChange={e => setForm({ ...form, experience_years: e.target.value })} />
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1e3a5f", marginBottom: 6 }}>CV (opsiyonel)</label>
                <input type="file" accept=".pdf,.docx" onChange={e => setAdminCvFile(e.target.files?.[0] || null)} style={{ width: "100%", padding: 12, borderRadius: 8, border: "2px solid #e2e8f0" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1e3a5f", marginBottom: 6 }}>AI Notu / Özel Talimat (aday görmez)</label>
                <textarea rows={3} value={form.ai_note} onChange={e => setForm({ ...form, ai_note: e.target.value })} placeholder="Örn. İngilizceyi özellikle ölç. Bu aday değerli, öğrenme potansiyeline ağırlık ver. CV'deki Medidata deneyimini doğrula." style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e2e8f0", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <Button disabled={loading || !form.name || (!editingId && !form.email) || !form.position} onClick={editingId ? updateCandidate : createCandidate} style={{ width: "100%" }}>
                  {loading ? "Kaydediliyor..." : editingId ? "Değişiklikleri Kaydet" : "Aday Ekle & Davet Gönder"}
                </Button>
                {editingId && (
                  <Button disabled={loading || !form.name || !form.email || !form.position} onClick={resendAsNew} style={{ width: "100%", marginTop: 8, background: "#0f766e" }}>
                    {loading ? "Gönderiliyor..." : "📨 Tekrar Davet Gönder (Yeni Kullanıcı & Şifre)"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Candidates list */}
        <Card>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f", marginBottom: 16 }}>Adaylar</div>
          {candidates.length === 0 ? (
            <div style={{ textAlign: "center", color: "#64748b", padding: 40 }}>Henüz aday yok</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Ad Soyad", "Telefon", "Pozisyon", "Eğitim/CV", "Tür", "Durum", "Skor", "Öneri", "İşlem"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#1e3a5f", fontWeight: 600, borderBottom: "2px solid #e2e8f0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map(c => {
                    const st = STATUS_LABELS[c.status] || STATUS_LABELS.pending;
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px" }}>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>{c.email || "-"}</div>
                        </td>
                        <td style={{ padding: "12px", fontSize: 13, whiteSpace: "nowrap" }}>
                          {c.phone ? <a href={`tel:${c.phone}`} style={{ color: "#1e3a5f", fontWeight: 600, textDecoration: "none" }}>{c.phone}</a> : "-"}
                          {c.phone && <div><a href={`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#22c55e", textDecoration: "none" }}>WhatsApp</a></div>}
                        </td>
                        <td style={{ padding: "12px", fontSize: 13 }}>{c.position}</td>
                        <td style={{ padding: "12px", fontSize: 12, color: "#475569" }}>
                          <div>{c.education || "-"}</div>
                          {c.university && <div>{c.university}</div>}
                          {c.department && <div>{c.department}</div>}
                          <div style={{ marginTop: 4, color: c.cv_filename ? "#22c55e" : "#94a3b8", fontWeight: 600 }}>{c.cv_filename ? "CV var" : "CV yok"}</div>
                          {c.ai_note && <div style={{ marginTop: 4, color: "#7c3aed", fontWeight: 600 }}>AI notu var</div>}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ fontSize: 12, background: c.invite_type === "invite" ? "#eff6ff" : "#f0fdf4", color: c.invite_type === "invite" ? "#1e3a5f" : "#22c55e", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                            {c.invite_type === "invite" ? "Davetli" : "Genel"}
                          </span>
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ fontSize: 12, background: st.bg, color: st.color, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                            {st.label}
                          </span>
                          {c.terminated_reason && (
                            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>⚠️ İhlal nedeniyle sonlandı</div>
                          )}
                          {c.is_archived ? <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Eski başvuru</div> : null}
                          {c.reapply_allowed ? <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>Tekrar başvuru açık</div> : null}
                        </td>
                        <td style={{ padding: "12px", fontWeight: 700, color: "#1e3a5f" }}>
                          {formatScore(c.score)}
                          {(c.total_input_tokens || c.total_output_tokens) ? (
                            <div style={{ fontSize: 10, fontWeight: 500, color: "#94a3b8", marginTop: 2 }}>
                              {((c.total_input_tokens || 0) + (c.total_output_tokens || 0)).toLocaleString("tr-TR")} token
                            </div>
                          ) : null}
                        </td>
                        <td style={{ padding: "12px" }}>
                          {(() => {
                            const rec = normalizeRecommendation(c.score, c.recommendation);
                            return rec !== "-" ? <span style={{ fontSize: 12, color: REC_COLORS[rec] || "#64748b", fontWeight: 600 }}>{rec}</span> : "-";
                          })()}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {c.status === "completed" && (
                              <>
                                <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => viewReport(c.id)}>
                                  Rapor
                                </Button>
                              </>
                            )}
                            {c.status === "pending" && (
                              <>
                                <button onClick={() => resendInvite(c.id)} title="Maili tekrar gönder"
                                  style={{ background: "#eff6ff", color: "#1e3a5f", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                  ↻ Tekrar Gönder
                                </button>
                                <button onClick={() => showCredentials(c.id)} title="Mevcut bilgileri ekranda göster"
                                  style={{ background: "#f0fdf4", color: "#22c55e", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                  👁 Göster
                                </button>
                                <button onClick={() => resetPassword(c.id)} title="Şifreyi sıfırla (yeni şifre üretir)"
                                  style={{ background: "#fff7ed", color: "#f59e0b", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                  🔄 Şifre Sıfırla
                                </button>
                              </>
                            )}
                            <button onClick={() => startEdit(c)} title="Aday bilgilerini / AI notunu düzenle"
                              style={{ background: "#f5f3ff", color: "#7c3aed", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              ✏️ Düzenle
                            </button>
                            <button onClick={() => toggleReapply(c.id)} title="Adayın aynı e-posta ile yeniden başvurmasına izin ver/kapat"
                              style={{ background: c.reapply_allowed ? "#dcfce7" : "#eef2ff", color: c.reapply_allowed ? "#166534" : "#3730a3", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              {c.reapply_allowed ? "İzni Kapat" : "Tekrar İzin"}
                            </button>
                            <button onClick={() => deleteCandidate(c.id, c.name)} title="Adayı sil"
                              style={{ background: "#fef2f2", color: "#ef4444", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              Sil
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Report Modal */}
        {selectedReport && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 32, maxWidth: 700, width: "100%", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1e3a5f" }}>Mülakat Raporu</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {selectedReport.name} · {selectedReport.email || "E-posta yok"} · {selectedReport.phone || "Telefon yok"}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                    Eğitim: {selectedReport.education || "-"} · Üniversite: {selectedReport.university || "-"} · Bölüm: {selectedReport.department || "-"} · Deneyim: {selectedReport.experience_years ?? 0} yıl
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="secondary" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => downloadPdf(selectedReport.candidate_id, selectedReport.name)}>
                    PDF İndir
                  </Button>
                  <button onClick={() => { setSelectedReport(null); setSnapshots([]); setModalError(""); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
                </div>
              </div>
              {modalError && <Alert>{modalError}</Alert>}
              <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, color: "#1e3a5f", marginBottom: 10, fontSize: 14 }}>Mülakat Sırasında Alınan Kareler ({snapshots.length}/4)</div>
                  {snapshots.length === 0 && <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>Henüz kayıtlı kamera karesi yok.</div>}
                  {snapshots.length > 0 && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {snapshots.map(s => (
                      <img key={s.id} src={s.image_base64} alt="mülakat karesi"
                        style={{ width: 110, height: 82, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} />
                    ))}
                  </div>
                  )}
                </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#1e3a5f" }}>{selectedReport.score ?? "-"}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>/ 100</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: REC_COLORS[normalizeRecommendation(selectedReport.score, selectedReport.recommendation)] || "#64748b" }}>
                    {normalizeRecommendation(selectedReport.score, selectedReport.recommendation)}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Öneri</div>
                </div>
              </div>

              {selectedReport.usage_logs && selectedReport.usage_logs.length > 0 && (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, color: "#1e3a5f", marginBottom: 10 }}>AI Kullanım Logu</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                    Toplam: {(selectedReport.usage_total_tokens || 0).toLocaleString("tr-TR")} token
                    {" · "}
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>
                      ~${(selectedReport.usage_total_cost_usd || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </span>
                    <span style={{ color: "#94a3b8" }}> (tahmini — fatura değil; ses token'ları metinden çok daha pahalı olduğu için toplam token sayısı tek başına maliyeti göstermez)</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: "#475569", textAlign: "left" }}>
                          <th style={{ padding: 6, borderBottom: "1px solid #e2e8f0" }}>İşlem</th>
                          <th style={{ padding: 6, borderBottom: "1px solid #e2e8f0" }}>Model</th>
                          <th style={{ padding: 6, borderBottom: "1px solid #e2e8f0" }}>Text In</th>
                          <th style={{ padding: 6, borderBottom: "1px solid #e2e8f0" }}>Text Out</th>
                          <th style={{ padding: 6, borderBottom: "1px solid #e2e8f0" }}>Audio In</th>
                          <th style={{ padding: 6, borderBottom: "1px solid #e2e8f0" }}>Audio Out</th>
                          <th style={{ padding: 6, borderBottom: "1px solid #e2e8f0" }}>Toplam</th>
                          <th style={{ padding: 6, borderBottom: "1px solid #e2e8f0" }}>~$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReport.usage_logs.map((u, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: 6, borderBottom: "1px solid #eef2f7" }}>{u.action}</td>
                            <td style={{ padding: 6, borderBottom: "1px solid #eef2f7" }}>{u.model}</td>
                            <td style={{ padding: 6, borderBottom: "1px solid #eef2f7" }}>{(u.input_tokens || 0).toLocaleString("tr-TR")}</td>
                            <td style={{ padding: 6, borderBottom: "1px solid #eef2f7" }}>{(u.output_tokens || 0).toLocaleString("tr-TR")}</td>
                            <td style={{ padding: 6, borderBottom: "1px solid #eef2f7" }}>{(u.audio_input_tokens || 0).toLocaleString("tr-TR")}</td>
                            <td style={{ padding: 6, borderBottom: "1px solid #eef2f7" }}>{(u.audio_output_tokens || 0).toLocaleString("tr-TR")}</td>
                            <td style={{ padding: 6, borderBottom: "1px solid #eef2f7", fontWeight: 700 }}>{(u.total_tokens || 0).toLocaleString("tr-TR")}</td>
                            <td style={{ padding: 6, borderBottom: "1px solid #eef2f7", fontWeight: 700, color: "#b45309" }}>${(u.estimated_cost_usd || 0).toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <ReportText text={selectedReport.report} />
              {selectedReport.ai_note && (
                <>
                  <div style={{ fontWeight: 700, color: "#1e3a5f", marginBottom: 10 }}>AI Notu / Özel Talimat</div>
                  <pre style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: 16, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                    {selectedReport.ai_note}
                  </pre>
                </>
              )}
              {selectedReport.cv_text && (
                <>
                  <div style={{ fontWeight: 700, color: "#1e3a5f", marginBottom: 10 }}>Adayın Yüklediği CV {selectedReport.cv_filename ? `(${selectedReport.cv_filename})` : ""}</div>
                  <pre style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7, maxHeight: 260, overflowY: "auto" }}>
                    {selectedReport.cv_text}
                  </pre>
                </>
              )}
              {selectedReport.standard_cv && (
                <>
                  <div style={{ fontWeight: 700, color: "#1e3a5f", marginBottom: 10 }}>Standart CV</div>
                  <pre style={{ background: "#f8fafc", borderRadius: 8, padding: 16, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                    {selectedReport.standard_cv}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}

        {credModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 32, maxWidth: 400, width: "100%", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1e3a5f", marginBottom: 8 }}>Giriş Bilgileri</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Mail gönderilemedi veya manuel iletmek istiyorsanız bu bilgileri kullanın.</div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Kullanıcı Adı</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "#1e3a5f" }}>{credModal.username}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Şifre</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "#1e3a5f" }}>{credModal.password}</div>
                </div>
              </div>
              <Button onClick={() => setCredModal(null)} style={{ width: "100%" }}>Kapat</Button>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
