import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { formatApiError } from "../apiClient";
import { Card, Input, Select, Button, Alert, Badge, StatTile, Tabs, Table, Avatar, FilterChip, colors, FONT } from "../components/Layout";
import { API_URL } from "../App";
import PositionManager from "./PositionManager";
import WalkinPanel from "./WalkinPanel";
import CvPool from "./CvPool";
import SuperAdminPanel from "./SuperAdminPanel";

const STATUS_TONE = { pending: "yellow", completed: "green" };
const STATUS_LABELS = { pending: "Bekliyor", completed: "Tamamlandı" };
const REC_TONE = { "İşe Al": "green", "Değerlendirmeye Al": "yellow", "Reddet": "red" };

// backend/LEVELS.md ile senkron tutulmalı — level seçerken admine kısa bir yön verir.
const LEVEL_INFO = {
  1: "Level 1: Hızlı ön eleme. Metin bazlı, nötr/standart ton, CV opsiyonel.",
  2: "Level 2: Sesli mülakat (OpenAI Realtime). Meslektaş tonu, orta derinlik, CV zorunlu.",
  3: "Level 3: Kıdemli/kritik pozisyonlar için uçtan uca derinlemesine değerlendirme. Senior/direkt ton, süre sabit değil (adaptif), CV zorunlu.",
};

const formatScore = (value) => (value === null || value === undefined || value === "" ? "-" : `${value}/100`);

const normalizeRecommendation = (score, recommendation) => {
  if (score === null || score === undefined || score === "") return recommendation || "-";
  const n = Number(score);
  if (Number.isNaN(n)) return recommendation || "-";
  if (n < 40) return "Reddet";
  if (n < 80) return "Değerlendirmeye Al";
  return "İşe Al";
};

const nextAction = (c, rec) => {
  if (c.status !== "completed") {
    if (c.processing_status === "processing") return { text: "Rapor hazırlanıyor, bekleyin", tone: "yellow" };
    if (c.processing_status === "failed") return { text: "Rapor hatası — tekrar deneyin", tone: "red" };
    return { text: "Adayın başlamasını bekleyin", tone: "yellow" };
  }
  if (c.terminated_reason) return { text: "İhlal raporunu incele", tone: "red" };
  if (rec === "İşe Al") return { text: "İşe alım kararını onayla", tone: "green" };
  if (rec === "Reddet") return { text: "Red kararını onayla", tone: "red" };
  if (rec === "Değerlendirmeye Al") return { text: "Raporu incele", tone: "yellow" };
  return { text: "Detayları görüntüle", tone: "neutral" };
};

const csvEscape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const emptyForm = { name: "", email: "", phone: "", positionGroup: "", position: "", level: 1, depth_tier: "standart", interview_language: "tr", report_language: "tr", education: "", university: "", department: "", experience_years: 0, ai_note: "" };

export default function AdminDashboard() {
  const [candidates, setCandidates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [adminCvFile, setAdminCvFile] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("candidates");
  const [positionsRaw, setPositionsRaw] = useState([]);
  const [adminRole, setAdminRole] = useState(null);
  const [listFilter, setListFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const token = localStorage.getItem("admin_token");

  useEffect(() => {
    if (!token) { navigate("/admin"); return; }
    fetchCandidates();
    apiClient.get(`${API_URL}/api/admin/positions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const list = (Array.isArray(res.data) ? res.data : []).filter(p => p.active);
        setPositionsRaw(list);
      });
    apiClient.get(`${API_URL}/api/admin/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setAdminRole(res.data?.admin_role || null))
      .catch(() => {});
    // eslint-disable-next-line
  }, []);

  // Grup (kategori) -> Pozisyon bağımlı combo yardımcıları
  const groupOptions = Array.from(new Set(positionsRaw.map(p => p.category || "Genel"))).map(c => ({ value: c, label: c }));
  const positionOptionsForGroup = (group) => positionsRaw.filter(p => (p.category || "Genel") === group).map(p => ({ value: p.name, label: p.name }));

  const fetchCandidates = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/api/admin/candidates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCandidates(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      // 401'de apiClient interceptor'ı zaten yönlendiriyor; burada sadece görünür bir hata bırakıyoruz.
      setError(formatApiError(e, "Aday listesi yüklenemedi").message);
    }
  };

  const exportCsv = () => {
    const header = ["Ad Soyad", "Telefon", "E-posta", "Pozisyon", "Durum", "Skor", "Öneri", "Sonraki Aksiyon"];
    const lines = filteredGroups.map(g => {
      const c = g.latest;
      const rec = normalizeRecommendation(c.score, c.recommendation);
      return [c.name, c.phone || "-", c.email || "-", c.position, STATUS_LABELS[c.status] || c.status, formatScore(c.score), rec, nextAction(c, rec).text]
        .map(csvEscape).join(",");
    });
    const csv = [header.map(csvEscape).join(","), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adaylar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cancelForm = () => {
    setShowForm(false);
    setForm(emptyForm);
  };

  const createCandidate = async () => {
    setLoading(true); setError(""); setSuccess("");
    try {
      const res = await apiClient.post(`${API_URL}/api/admin/candidates`, form, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (adminCvFile) {
        const fd = new FormData();
        fd.append("file", adminCvFile);
        await apiClient.post(`${API_URL}/api/admin/candidates/${res.data.id}/upload-cv`, fd, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }
        });
      }
      if (res.data.mail_sent) {
        setSuccess(`Aday eklendi. Kullanıcı: ${res.data.username} | Şifre: ${res.data.password} | Davet maili gönderildi.`);
      } else {
        setSuccess(`Aday eklendi ama davet maili gönderilemedi. Kullanıcı: ${res.data.username} | Şifre: ${res.data.password} — bu bilgileri adaya manuel iletmeniz gerekiyor.`);
      }
      cancelForm();
      setAdminCvFile(null);
      fetchCandidates();
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
    setLoading(false);
  };

  const stats = {
    total: candidates.length,
    pending: candidates.filter(c => c.status === "pending").length,
    completed: candidates.filter(c => c.status === "completed").length,
    hireCount: candidates.filter(c => c.recommendation === "İşe Al").length,
  };

  // Kişi bazlı gruplama: aynı person_id'ye sahip tüm denemeler tek satırda,
  // en son oluşturulan deneme "öne çıkan" olarak gösterilir.
  const personGroups = () => {
    const map = new Map();
    candidates.forEach(c => {
      const key = c.person_id || `tekil-${c.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    });
    return Array.from(map.entries()).map(([key, list]) => {
      const sorted = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { key, latest: sorted[0], count: sorted.length };
    }).sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at));
  };

  const filteredGroups = personGroups().filter(g => {
    if (listFilter !== "all" && g.latest.status !== listFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${g.latest.name || ""} ${g.latest.email || ""} ${g.latest.phone || ""} ${g.latest.position || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, padding: "20px 16px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div style={{ background: colors.ink, padding: "12px 22px", borderRadius: 10, flex: "1 1 240px" }}>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>MedeX SMO</div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>Admin Paneli</div>
          </div>
          <Button variant="secondary" onClick={() => { localStorage.removeItem("admin_token"); navigate("/admin"); }}>
            Çıkış
          </Button>
        </div>

        {/* Stats */}
        <div className="admin-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
          <StatTile label="Toplam Aday" value={stats.total} />
          <StatTile label="Bekleyen" value={stats.pending} />
          <StatTile label="Tamamlanan" value={stats.completed} />
          <StatTile label="İşe Al Önerisi" value={stats.hireCount} />
        </div>

        {/* Tabs */}
        <Tabs
          active={tab}
          onChange={setTab}
          items={[
            { key: "candidates", label: "Adaylar" },
            { key: "positions", label: "Pozisyonlar" },
            { key: "walkin", label: "Hızlı Giriş" },
            { key: "cvpool", label: "CV Havuzu" },
            ...(adminRole === "superadmin" ? [{ key: "orgs", label: "Kurumlar" }] : []),
          ]}
        />

        {tab === "positions" && <PositionManager token={token} />}
        {tab === "walkin" && <WalkinPanel token={token} />}
        {tab === "cvpool" && <CvPool token={token} />}
        {tab === "orgs" && adminRole === "superadmin" && <SuperAdminPanel token={token} />}
        {tab === "candidates" && (
        <>
        {success && <Alert type="success">{success}</Alert>}
        {error && <Alert>{error}</Alert>}

        {/* Add candidate */}
        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showForm ? 20 : 0, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink }}>Aday Davet Et</div>
            <Button onClick={() => showForm ? cancelForm() : setShowForm(true)}>
              {showForm ? "İptal" : "+ Yeni Aday"}
            </Button>
          </div>
          {showForm && (
            <>
              {/* Grup 1: Kişi Bilgileri */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.mutedLight, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Kişi Bilgileri</div>
              <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 10 }}>
                <Input label="Ad Soyad" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ahmet Yılmaz" />
                <Input label="E-posta" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="ahmet@email.com" />
                <Input label="Telefon (opsiyonel)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" />
              </div>

              {/* Grup 2: Pozisyon & Mülakat Ayarları */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.mutedLight, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6, marginBottom: 10 }}>Pozisyon & Mülakat Ayarları</div>
              <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                <Select label="Grup" options={groupOptions} value={form.positionGroup} onChange={e => setForm({ ...form, positionGroup: e.target.value, position: "" })} />
                <Select label="Pozisyon" options={positionOptionsForGroup(form.positionGroup)} value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} disabled={!form.positionGroup} />
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
                    { value: "kisa", label: "Kısa — hedeften daha az" },
                    { value: "standart", label: "Standart — level'ın baz süresine yakın" },
                    { value: "derin", label: "Derin — hedeften belirgin şekilde daha uzun" },
                  ]}
                  value={form.depth_tier}
                  onChange={e => setForm({ ...form, depth_tier: e.target.value })}
                />
              </div>
              <div style={{ fontSize: 12, color: colors.inkSoft, background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
                {LEVEL_INFO[form.level] || LEVEL_INFO[1]}
              </div>
              {form.level >= 2 && !adminCvFile && (
                <div style={{ fontSize: 12, color: colors.yellow, background: colors.yellowBg, border: `1px solid ${colors.yellowBorder}`, borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
                  Bu seviyede aday CV yüklemeden mülakata başlayamaz. CV'yi buradan yükleyebilir veya adayın kendi yüklemesini bekleyebilirsiniz.
                </div>
              )}

              {/* Grup 3: Dil Ayarları */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.mutedLight, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6, marginBottom: 10 }}>Dil Ayarları</div>
              <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                <Select label="Mülakat Dili" options={[{ value: "tr", label: "Türkçe" }, { value: "en", label: "İngilizce" }, { value: "de", label: "Almanca" }]} value={form.interview_language} onChange={e => setForm({ ...form, interview_language: e.target.value })} />
                <Select label="Rapor Dili" options={[{ value: "tr", label: "Türkçe" }, { value: "en", label: "İngilizce" }, { value: "de", label: "Almanca" }]} value={form.report_language} onChange={e => setForm({ ...form, report_language: e.target.value })} />
              </div>
              {form.interview_language !== form.report_language && (
                <div style={{ fontSize: 12, color: colors.blue, background: colors.blueBg, border: `1px solid ${colors.blueBorder}`, borderRadius: 6, padding: "8px 10px", marginBottom: 10 }}>
                  Not: Mülakat {form.interview_language === "tr" ? "Türkçe" : form.interview_language === "en" ? "İngilizce" : "Almanca"} yapılacak, rapor {form.report_language === "tr" ? "Türkçe" : form.report_language === "en" ? "İngilizce" : "Almanca"} yazılacak.
                </div>
              )}

              {/* Grup 4: Eğitim & Deneyim */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.mutedLight, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6, marginBottom: 10 }}>Eğitim & Deneyim</div>
              <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
                <Select
                  label="Eğitim Seviyesi"
                  options={[
                    { value: "Lise", label: "Lise" }, { value: "Ön Lisans", label: "Ön Lisans" }, { value: "Lisans", label: "Lisans" },
                    { value: "Yüksek Lisans", label: "Yüksek Lisans" }, { value: "Doktora", label: "Doktora" },
                  ]}
                  value={form.education}
                  onChange={e => setForm({ ...form, education: e.target.value })}
                />
                <Input label="Deneyim yılı" type="number" min="0" value={form.experience_years} onChange={e => setForm({ ...form, experience_years: e.target.value })} />
                <Input label="Üniversite" value={form.university} onChange={e => setForm({ ...form, university: e.target.value })} placeholder="Üniversite" />
                <Input label="Bölüm" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Bölüm" />
              </div>

              {/* Grup 5: Ek Belgeler */}
              <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.mutedLight, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 6, marginBottom: 10 }}>Ek Belgeler</div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>CV (opsiyonel)</label>
                <input type="file" accept=".pdf,.docx" onChange={e => setAdminCvFile(e.target.files?.[0] || null)} style={{ width: "100%", padding: 11, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: FONT, boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>AI Notu / Özel Talimat (aday görmez)</label>
                <textarea rows={3} value={form.ai_note} onChange={e => setForm({ ...form, ai_note: e.target.value })} placeholder="Örn. İngilizceyi özellikle ölç. CV'deki Medidata deneyimini doğrula." style={{ width: "100%", padding: "10px 13px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }} />
              </div>

              <Button disabled={loading || !form.name || !form.email || !form.position} onClick={createCandidate} style={{ width: "100%" }}>
                {loading ? "Kaydediliyor..." : "Aday Ekle & Davet Gönder"}
              </Button>
            </>
          )}
        </Card>

        {/* Candidates list */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink }}>Adaylar</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ maxWidth: 280, width: "100%" }}>
                <input
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="İsim, e-posta, telefon veya pozisyon ara..."
                  style={{ width: "100%", padding: "8px 13px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: FONT, boxSizing: "border-box" }}
                />
              </div>
              <Button variant="secondary" onClick={exportCsv} disabled={filteredGroups.length === 0}>Excel</Button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <FilterChip active={listFilter === "all"} onClick={() => setListFilter("all")}>Tümü {personGroups().length}</FilterChip>
            <FilterChip active={listFilter === "pending"} onClick={() => setListFilter("pending")}>Bekleyen {personGroups().filter(g => g.latest.status === "pending").length}</FilterChip>
            <FilterChip active={listFilter === "completed"} onClick={() => setListFilter("completed")}>Tamamlanan {personGroups().filter(g => g.latest.status === "completed").length}</FilterChip>
          </div>

          {filteredGroups.length === 0 ? (
            <div style={{ textAlign: "center", color: colors.muted, padding: 40 }}>Aday bulunamadı</div>
          ) : (
            <Table columns={["Kişi", "Telefon", "Pozisyon", "Durum", "Skor", "Öneri", "Sonraki Aksiyon"]}>
              {filteredGroups.map(g => {
                const c = g.latest;
                const rec = normalizeRecommendation(c.score, c.recommendation);
                const action = nextAction(c, rec);
                return (
                  <tr
                    key={g.key}
                    onClick={() => c.person_id && navigate(`/admin/panel/person/${c.person_id}`)}
                    style={{ borderBottom: `1px solid ${colors.border}`, cursor: c.person_id ? "pointer" : "default" }}
                  >
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={c.name} size={34} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: colors.ink }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: colors.muted }}>{c.email || "-"}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13, whiteSpace: "nowrap" }}>{c.phone || "-"}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>
                      {c.position}
                      {g.count > 1 && <div style={{ marginTop: 4 }}><Badge tone="blue">{g.count} deneme</Badge></div>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <Badge tone={STATUS_TONE[c.status] || "yellow"}>{STATUS_LABELS[c.status] || c.status}</Badge>
                      {c.status !== "completed" && c.processing_status === "processing" && (
                        <div style={{ marginTop: 4 }}><Badge tone="yellow">⏳ Rapor Hazırlanıyor</Badge></div>
                      )}
                      {c.status !== "completed" && c.processing_status === "failed" && (
                        <div style={{ marginTop: 4 }}><Badge tone="red" title={c.processing_error || ""}>⚠ Rapor Hatası</Badge></div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: colors.ink }}>{formatScore(c.score)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {rec !== "-" ? <Badge tone={REC_TONE[rec] || "neutral"}>{rec}</Badge> : "-"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: colors.inkSoft, fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", flex: "none", background: colors[action.tone] || colors.mutedLight }} />
                        {action.text}
                        <span style={{ color: colors.mutedLight, marginLeft: "auto" }}>→</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
        </>
        )}
      </div>
    </div>
  );
}
