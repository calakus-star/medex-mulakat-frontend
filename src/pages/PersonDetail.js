import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiClient, { formatApiError } from "../apiClient";
import { Header, Card, Input, Select, Button, Alert, Badge, Modal, colors, FONT } from "../components/Layout";
import { API_URL } from "../App";

const STATUS_LABELS = { pending: "Bekliyor", completed: "Tamamlandı" };
const STATUS_TONE = { pending: "yellow", completed: "green" };
const REC_TONE = { "İşe Al": "green", "Değerlendirmeye Al": "yellow", "Reddet": "red" };

// AI kullanım logu — teknik action adlarını okunabilir kaleme çevirir (FAZ D: mimik + denetçi eklendi).
const USAGE_ACTION_LABELS = {
  interview_chat: "Mülakat turları",
  report_generation_primary: "Rapor üretimi (birincil)",
  l2_report_generation_deferred: "Rapor üretimi (birincil)",
  mimic_frame_analysis: "Mimik analizi (kareler)",
  report_reviewer: "Ortak rapor — muhalif denetçi",
  realtime_session: "Realtime oturum açılışı",
  realtime_heartbeat: "Realtime ara kayıt",
  realtime_final_frontend: "Realtime kapanış kullanımı",
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
    <div style={{ background: colors.surfaceAlt, borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.65, marginBottom: 20 }}>
      {lines.map((line, idx) => {
        const isTitle = line.endsWith(":") || line.startsWith("TOPLAM PUAN") || line.startsWith("Öneri:");
        return <div key={idx} style={{ marginBottom: 6, fontWeight: isTitle ? 700 : 400, color: isTitle ? colors.ink : colors.inkSoft, whiteSpace: "pre-wrap" }}>{line}</div>;
      })}
    </div>
  );
}

const emptyEditForm = { name: "", email: "", phone: "", positionGroup: "", position: "", level: 1, depth_tier: "standart", interview_language: "tr", report_language: "tr", education: "", university: "", department: "", experience_years: 0, ai_note: "" };

export default function PersonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token");

  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteBody, setNoteBody] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [positionsRaw, setPositionsRaw] = useState([]);

  const [selectedReport, setSelectedReport] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [modalError, setModalError] = useState("");
  const [credModal, setCredModal] = useState(null);

  const [editingAttemptId, setEditingAttemptId] = useState(null);
  const [attemptMode, setAttemptMode] = useState("edit"); // "edit" | "new" — aynı form iki işi görür
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editCvFile, setEditCvFile] = useState(null);
  // Değişmemiş alanları PATCH gövdesinden dışlayabilmek için formun açılış anlık
  // görüntüsü — startEditAttempt'te doldurulur, saveEditAttempt'te diff için okunur.
  const editFormInitialRef = useRef(null);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchAll = async () => {
    try {
      const [personRes, notesRes] = await Promise.all([
        apiClient.get(`${API_URL}/api/admin/persons/${id}`, authHeaders),
        apiClient.get(`${API_URL}/api/admin/persons/${id}/notes`, authHeaders),
      ]);
      setDetail(personRes.data);
      setNotes(notesRes.data || []);
    } catch (e) {
      setError(formatApiError(e, "Kişi bilgileri yüklenemedi").message);
    }
  };

  useEffect(() => {
    if (!token) { navigate("/admin"); return; }
    fetchAll();
    apiClient.get(`${API_URL}/api/admin/positions`, authHeaders).then(res => {
      setPositionsRaw((Array.isArray(res.data) ? res.data : []).filter(p => p.active));
    });
    // eslint-disable-next-line
  }, [id]);

  const groupOptions = Array.from(new Set(positionsRaw.map(p => p.category || "Genel"))).map(c => ({ value: c, label: c }));
  const positionOptionsForGroup = (group) => positionsRaw.filter(p => (p.category || "Genel") === group).map(p => ({ value: p.name, label: p.name }));
  const findGroupForPosition = (positionName) => {
    const found = positionsRaw.find(p => p.name === positionName);
    return found ? (found.category || "Genel") : "";
  };

  const addNote = async () => {
    if (!noteBody.trim()) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      await apiClient.post(`${API_URL}/api/admin/persons/${id}/notes`, { body: noteBody.trim() }, authHeaders);
      setNoteBody("");
      const notesRes = await apiClient.get(`${API_URL}/api/admin/persons/${id}/notes`, authHeaders);
      setNotes(notesRes.data || []);
      setSuccess("Not eklendi");
    } catch (e) {
      setError(formatApiError(e, "Not eklenemedi").message);
    }
    setLoading(false);
  };

  const runEvaluate = async () => {
    setEvaluating(true); setError(""); setSuccess("");
    try {
      await apiClient.post(`${API_URL}/api/admin/persons/${id}/evaluate`, {}, authHeaders);
      const notesRes = await apiClient.get(`${API_URL}/api/admin/persons/${id}/notes`, authHeaders);
      setNotes(notesRes.data || []);
      setSuccess("Değerlendirme oluşturuldu");
    } catch (e) {
      setError(formatApiError(e, "Değerlendirme oluşturulamadı").message);
    }
    setEvaluating(false);
  };

  const viewReport = async (candidateId) => {
    setModalError("");
    try {
      const res = await apiClient.get(`${API_URL}/api/admin/interviews/${candidateId}`, authHeaders);
      setSelectedReport(res.data);
      try {
        const snapRes = await apiClient.get(`${API_URL}/api/admin/snapshots/${candidateId}`, authHeaders);
        setSnapshots(snapRes.data || []);
      } catch (e) {
        setSnapshots([]);
        setModalError(formatApiError(e, "Kamera kareleri yüklenemedi").message);
      }
    } catch (e) {
      setError("Rapor bulunamadı");
    }
  };

  const downloadPdf = async (candidateId, candidateName = "aday") => {
    try {
      const res = await apiClient.get(`${API_URL}/api/admin/interviews/${candidateId}/pdf`, { ...authHeaders, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `MedeX_Rapor_${candidateName.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      if (e.code === "ECONNABORTED") {
        setModalError("Sunucudan yanıt gelmedi, PDF indirilemedi — lütfen tekrar deneyin.");
        return;
      }
      // Blob responseType nedeniyle hata gövdesi de Blob geliyor — normal JSON detail
      // ayrıştırması burada işe yaramaz, önce metne çevrilip ayrıca ayrıştırılıyor.
      let detail = "PDF rapor indirilemedi";
      try {
        if (e.response?.data instanceof Blob) {
          const text = await e.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed?.detail) detail = parsed.detail;
        } else if (e.response?.data?.detail) detail = e.response.data.detail;
      } catch (parseErr) {
        console.error("PDF hata gövdesi ayrıştırılamadı:", parseErr);
      }
      setModalError(detail);
    }
  };

  const resendInvite = async (candidateId) => {
    try {
      const res = await apiClient.post(`${API_URL}/api/admin/candidates/${candidateId}/resend`, {}, authHeaders);
      if (res.data.mail_sent) setSuccess(`Mail tekrar gönderildi. Kullanıcı: ${res.data.username}`);
      else setCredModal({ username: res.data.username, password: res.data.password });
      fetchAll();
    } catch (e) {
      setError(formatApiError(e, "Davet tekrar gönderilemedi").message);
    }
  };

  const showCredentials = async (candidateId) => {
    try {
      const res = await apiClient.post(`${API_URL}/api/admin/candidates/${candidateId}/show-credentials`, {}, authHeaders);
      setCredModal({ username: res.data.username, password: res.data.password });
    } catch (e) {
      setError(formatApiError(e, "Giriş bilgileri gösterilemedi").message);
    }
  };

  const resetPassword = async (candidateId) => {
    if (!window.confirm("Şifreyi sıfırlamak istediğine emin misin? Eski şifre geçersiz olacak.")) return;
    try {
      const res = await apiClient.post(`${API_URL}/api/admin/candidates/${candidateId}/reset-password`, {}, authHeaders);
      setCredModal({ username: res.data.username, password: res.data.password });
    } catch (e) {
      setError(formatApiError(e, "Şifre sıfırlanamadı").message);
    }
  };

  const deleteCandidate = async (candidateId, name) => {
    if (!window.confirm(`${name} adlı adayın bu denemesini silmek istediğine emin misin? Bu işlem geri alınamaz.`)) return;
    try {
      await apiClient.delete(`${API_URL}/api/admin/candidates/${candidateId}`, authHeaders);
      setSuccess(`Deneme silindi`);
      fetchAll();
    } catch (e) {
      setError(formatApiError(e, "Silme işlemi başarısız").message);
    }
  };

  const toggleReapply = async (candidateId) => {
    try {
      const res = await apiClient.post(`${API_URL}/api/admin/candidates/${candidateId}/allow-reapply`, {}, authHeaders);
      setSuccess(res.data.reapply_allowed ? "Tekrar başvuru izni açıldı" : "Tekrar başvuru izni kapatıldı");
      fetchAll();
    } catch (e) {
      setError(formatApiError(e, "Tekrar başvuru izni güncellenemedi").message);
    }
  };

  const attemptFormFrom = (a) => ({
    name: a.name || "", email: a.email || "", phone: a.phone || "",
    positionGroup: findGroupForPosition(a.position || ""), position: a.position || "",
    level: a.level || 1, depth_tier: a.depth_tier || "standart",
    interview_language: a.interview_language || "tr", report_language: a.report_language || "tr",
    education: a.education || "", university: a.university || "", department: a.department || "",
    experience_years: a.experience_years || 0, ai_note: a.ai_note || "",
  });

  const startEditAttempt = (a) => {
    setAttemptMode("edit");
    setEditingAttemptId(a.candidate_id);
    const initial = attemptFormFrom(a);
    setEditForm(initial);
    editFormInitialRef.current = initial;
    setEditCvFile(null);
    setError("");
  };

  // Tamamlanmış mülakat düzenlemeye kapalıdır — aynı kişi/aynı kaynak için yeni bir çağrı açar.
  const startNewAttempt = (a) => {
    setAttemptMode("new");
    setEditingAttemptId(a.candidate_id);
    const initial = attemptFormFrom(a);
    setEditForm(initial);
    editFormInitialRef.current = initial;
    setEditCvFile(null);
    setError(""); setSuccess("");
  };

  const closeAttemptForm = () => { setEditingAttemptId(null); setAttemptMode("edit"); };

  const saveNewAttempt = async () => {
    setLoading(true); setError(""); setSuccess("");
    if (!editForm.position) {
      setError("Yeni çağrı için bir pozisyon seçilmelidir.");
      setLoading(false);
      return;
    }
    // KOPYALAMA KURALI: yalnızca formun açılış (kaynak) değerinden GERÇEKTEN değişen alan
    // gönderilir. Dokunulmayan alan gövdeye hiç girmez → backend onu kaynak kayıttan kopyalar.
    // Böylece kaynağın dili/seviyesi sabit bir varsayılana düşmez.
    const initial = editFormInitialRef.current || {};
    const body = {};
    ["position", "level", "depth_tier", "interview_language", "report_language", "ai_note"].forEach((k) => {
      if (editForm[k] !== initial[k]) body[k] = editForm[k];
    });
    let created;
    try {
      const res = await apiClient.post(`${API_URL}/api/admin/candidates/${editingAttemptId}/new-attempt`, body, authHeaders);
      created = res.data;
    } catch (e) {
      const { message, timeout } = formatApiError(e, "Yeni çağrı oluşturulamadı.");
      if (timeout) {
        setError("Sunucudan yanıt gelmedi, yeni çağrının oluşup oluşmadığı bilinmiyor — sayfa yenilenecek.");
        closeAttemptForm();
        fetchAll();
        setLoading(false);
        return;
      }
      setError(message);
      setLoading(false);
      return;
    }

    let cvWarning = "";
    if (editCvFile && created?.id) {
      try {
        const fd = new FormData();
        fd.append("file", editCvFile);
        const cvRes = await apiClient.post(`${API_URL}/api/admin/candidates/${created.id}/upload-cv`, fd, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }, timeout: 30000
        });
        if (cvRes.data?.cv_ownership_warning) cvWarning = ` ⚠ ${cvRes.data.cv_ownership_warning}`;
        else if (cvRes.data?.cv_ownership_note) cvWarning = ` ℹ ${cvRes.data.cv_ownership_note}`;
      } catch (e) {
        // Yeni çağrı zaten oluşturuldu; sadece CV yüklenemedi — ayrı ve net not.
        const { message } = formatApiError(e, "bilinmeyen hata");
        cvWarning = ` — Yeni çağrı oluştu ancak CV yüklenemedi: ${message}`;
      }
    }

    closeAttemptForm();
    setSuccess(`Yeni mülakat çağrısı oluşturuldu.${cvWarning}`);
    if (created?.username) setCredModal({ username: created.username, password: created.password });
    fetchAll();
    setLoading(false);
  };

  const saveEditAttempt = async () => {
    setLoading(true); setError(""); setSuccess("");
    // Backend'e sadece gerçek aday alanları gönderilir (positionGroup formun kendi
    // yardımcı state'i, CandidateUpdate modelinde karşılığı yok) VE sadece formun açılış
    // anındaki değerinden farklı olan alanlar — dokunulmamış alanlar PATCH'e hiç girmez,
    // böylece kısmi güncelleme (Aşama 1) fiilen de kısmi kalır.
    const { positionGroup, ...currentBody } = editForm;
    const { positionGroup: _initialGroup, ...initialBody } = editFormInitialRef.current || {};
    const patchBody = {};
    for (const key of Object.keys(currentBody)) {
      if (currentBody[key] !== initialBody[key]) patchBody[key] = currentBody[key];
    }
    try {
      // apiClient varsayılan timeout'u (20sn) yeterli — burada ayrıca tekrar tanımlanmıyor.
      await apiClient.patch(`${API_URL}/api/admin/candidates/${editingAttemptId}`, patchBody, authHeaders);
    } catch (e) {
      const { message, timeout } = formatApiError(e, "Aday bilgileri kaydedilemedi.");
      if (timeout) {
        // TIMEOUT: istek backend'e ulaşıp orada tamamlanmış olabilir, biz sadece yanıtı
        // görmedik — "kaydedilemedi" demek yanlış bilgi olur. Gerçek durumu sunucudan
        // tazeleyip gösteriyoruz, CV bu belirsiz durumda gönderilmiyor.
        setError("Sunucudan yanıt gelmedi, kaydın durumu bilinmiyor — sayfa yenilenecek.");
        setEditingAttemptId(null);
        fetchAll();
        setLoading(false);
        return;
      }
      // ATOMİKLİK: kayıt (PATCH) başarısızsa CV hiç gönderilmez — seçili bir dosya olsa bile.
      setError(editCvFile ? `${message} Kayıt yapılamadı, CV de yüklenmedi.` : message);
      setLoading(false);
      return;
    }

    let cvWarning = "";
    if (editCvFile) {
      try {
        const fd = new FormData();
        fd.append("file", editCvFile);
        // CV ayrıştırma PATCH'ten daha yavaş olabilir, varsayılan 20sn'nin üzerinde bilinçli
        // bir üst sınır — apiClient'in varsayılanını burada bilerek geçersiz kılıyoruz.
        const cvRes = await apiClient.post(`${API_URL}/api/admin/candidates/${editingAttemptId}/upload-cv`, fd, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" }, timeout: 30000
        });
        if (cvRes.data?.cv_ownership_warning) cvWarning = ` ⚠ ${cvRes.data.cv_ownership_warning}`;
        else if (cvRes.data?.cv_ownership_note) cvWarning = ` ℹ ${cvRes.data.cv_ownership_note}`;
      } catch (e) {
        const { message, timeout } = formatApiError(e, "bilinmeyen hata");
        if (timeout) {
          // Aday bilgileri (PATCH) zaten kaydedildi ve bunu biliyoruz; CV'nin sunucuda
          // gerçekten işlenip işlenmediği ise belirsiz — yanlış "başarısız" demek yerine
          // gerçek durumu sunucudan tazeliyoruz.
          setError("Sunucudan yanıt gelmedi, CV'nin durumu bilinmiyor — sayfa yenilenecek.");
        } else {
          // Aday bilgileri zaten kaydedildi; sadece CV yüklemesi başarısız oldu — ayrı ve net bir mesaj.
          setError(`Aday bilgileri kaydedildi, ancak CV yüklenemedi: ${message}`);
        }
        setEditingAttemptId(null);
        fetchAll();
        setLoading(false);
        return;
      }
    }

    setSuccess(`Aday bilgileri güncellendi${cvWarning}`);
    setEditingAttemptId(null);
    fetchAll();
    setLoading(false);
  };

  if (!detail) {
    return (
      <div style={{ minHeight: "100vh", background: colors.bg, padding: 24 }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {error ? <Alert>{error}</Alert> : <div style={{ color: colors.muted }}>Yükleniyor...</div>}
        </div>
      </div>
    );
  }

  const { person, attempts } = detail;

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, padding: "20px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <Button variant="secondary" onClick={() => navigate("/admin/panel")}>← Geri</Button>
        </div>
        <Header subtitle={`Kişi Geçmişi — ${person.full_name || "İsimsiz"}`} />

        {success && <Alert type="success">{success}</Alert>}
        {error && <Alert>{error}</Alert>}

        <Card style={{ marginBottom: 18 }}>
          <div className="person-info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 13 }}>
            <div><div style={{ color: colors.muted, fontSize: 12 }}>Ad Soyad</div><div style={{ fontWeight: 600, color: colors.ink }}>{person.full_name || "-"}</div></div>
            <div><div style={{ color: colors.muted, fontSize: 12 }}>E-posta</div><div style={{ fontWeight: 600, color: colors.ink }}>{person.email || "-"}</div></div>
            <div><div style={{ color: colors.muted, fontSize: 12 }}>Telefon</div><div style={{ fontWeight: 600, color: colors.ink }}>{person.phone || "-"}</div></div>
          </div>
        </Card>

        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink, marginBottom: 16 }}>
            Mülakat Denemeleri ({attempts.length})
          </div>
          {attempts.length === 0 ? (
            <div style={{ color: colors.muted, padding: 20, textAlign: "center" }}>Henüz mülakat denemesi yok</div>
          ) : (
            attempts.map(a => (
              <div key={a.candidate_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: colors.ink }}>
                      {a.position} · Level {a.level}
                      {a.is_archived ? <span style={{ marginLeft: 8, fontSize: 11, color: colors.mutedLight }}>(eski başvuru)</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>{a.created_at}</div>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge tone={STATUS_TONE[a.status] || "yellow"}>{STATUS_LABELS[a.status] || a.status}</Badge>
                      {a.processing_status === "processing" && <Badge tone="yellow">⏳ Rapor Hazırlanıyor</Badge>}
                      {a.processing_status === "failed" && <Badge tone="red" title={a.processing_error || ""}>⚠ Rapor Hatası</Badge>}
                      {a.score !== null && a.score !== undefined && <span style={{ fontWeight: 700, color: colors.ink, fontSize: 13 }}>{a.score}/100</span>}
                      {a.recommendation && <Badge tone={REC_TONE[a.recommendation] || "neutral"}>{a.recommendation}</Badge>}
                      {a.reapply_allowed ? <Badge tone="green">Tekrar başvuru açık</Badge> : null}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  {a.status === "completed" && (
                    <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => viewReport(a.candidate_id)}>Rapor</Button>
                  )}
                  {a.status !== "completed" && (a.processing_status === "processing" || a.processing_status === "failed") && (
                    <Button variant="secondary" disabled style={{ padding: "6px 12px", fontSize: 12, opacity: 0.5, cursor: "not-allowed" }}
                      title={a.processing_status === "failed" ? (a.processing_error || "Rapor üretimi başarısız oldu") : "Rapor hazır olunca aktif olacak"}>
                      {a.processing_status === "processing" ? "Rapor Hazırlanıyor…" : "Rapor Hatası"}
                    </Button>
                  )}
                  {a.status === "pending" && (
                    <>
                      <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => resendInvite(a.candidate_id)}>↻ Tekrar Gönder</Button>
                      <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => showCredentials(a.candidate_id)}>👁 Göster</Button>
                      <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => resetPassword(a.candidate_id)}>🔄 Şifre Sıfırla</Button>
                    </>
                  )}
                  {a.interview_completed_at ? (
                    <>
                      <Button variant="secondary" disabled style={{ padding: "6px 12px", fontSize: 12, opacity: 0.5, cursor: "not-allowed" }}
                        title="Tamamlanmış mülakat düzenlenemez. Yeni çağrı açın.">
                        ✏️ Düzenle
                      </Button>
                      <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }}
                        onClick={() => (editingAttemptId === a.candidate_id && attemptMode === "new") ? closeAttemptForm() : startNewAttempt(a)}>
                        {(editingAttemptId === a.candidate_id && attemptMode === "new") ? "Vazgeç" : "🔄 Yeni çağrı"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => (editingAttemptId === a.candidate_id && attemptMode === "edit") ? closeAttemptForm() : startEditAttempt(a)}>
                      {(editingAttemptId === a.candidate_id && attemptMode === "edit") ? "Düzenlemeyi Kapat" : "✏️ Düzenle"}
                    </Button>
                  )}
                  <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => toggleReapply(a.candidate_id)}>
                    {a.reapply_allowed ? "İzni Kapat" : "Tekrar İzin"}
                  </Button>
                  <Button variant="danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => deleteCandidate(a.candidate_id, person.full_name)}>Sil</Button>
                </div>

                {editingAttemptId === a.candidate_id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
                    {attemptMode === "new" && (
                      <div style={{ background: colors.surfaceAlt, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: colors.muted, marginBottom: 12, lineHeight: 1.5 }}>
                        Bu kişi için <strong>yeni bir mülakat çağrısı</strong> oluşturulacak. Ad, e-posta, telefon ve eğitim bilgileri kaynak denemeden birebir kopyalanır; burada yalnızca pozisyon, seviye, derinlik, dil ve AI notu belirlenir. Eski deneme ve raporu olduğu gibi kalır.
                      </div>
                    )}
                    <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <Input label="Ad Soyad" value={editForm.name} disabled={attemptMode === "new"} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                      <Input label="E-posta" value={editForm.email} disabled={attemptMode === "new"} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                      <Input label="Telefon" value={editForm.phone} disabled={attemptMode === "new"} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                      <Select label="Grup" options={groupOptions} value={editForm.positionGroup} onChange={e => setEditForm({ ...editForm, positionGroup: e.target.value, position: "" })} />
                      <Select label="Pozisyon" options={positionOptionsForGroup(editForm.positionGroup)} value={editForm.position} onChange={e => setEditForm({ ...editForm, position: e.target.value })} disabled={!editForm.positionGroup} />
                      <Select label="Mülakat Seviyesi" options={[{ value: 1, label: "Level 1" }, { value: 2, label: "Level 2" }, { value: 3, label: "Level 3" }]} value={editForm.level} onChange={e => setEditForm({ ...editForm, level: parseInt(e.target.value, 10) })} />
                      <Select label="Derinlik" options={[{ value: "kisa", label: "Kısa" }, { value: "standart", label: "Standart" }, { value: "derin", label: "Derin" }]} value={editForm.depth_tier} onChange={e => setEditForm({ ...editForm, depth_tier: e.target.value })} />
                      <Input label="Üniversite" value={editForm.university} disabled={attemptMode === "new"} onChange={e => setEditForm({ ...editForm, university: e.target.value })} />
                      <Input label="Bölüm" value={editForm.department} disabled={attemptMode === "new"} onChange={e => setEditForm({ ...editForm, department: e.target.value })} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>AI Notu / Özel Talimat</label>
                      <textarea rows={2} value={editForm.ai_note} onChange={e => setEditForm({ ...editForm, ai_note: e.target.value })} style={{ width: "100%", padding: "10px 13px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>
                        {attemptMode === "new" ? "CV (opsiyonel — boş bırakılırsa kaynak CV kopyalanır)" : "CV Güncelle (opsiyonel)"}
                      </label>
                      <input type="file" accept=".pdf,.docx" onChange={e => setEditCvFile(e.target.files?.[0] || null)} style={{ width: "100%", padding: 11, borderRadius: 8, border: `1px solid ${colors.border}`, fontFamily: FONT, boxSizing: "border-box" }} />
                    </div>
                    <Button disabled={loading} onClick={() => attemptMode === "new" ? saveNewAttempt() : saveEditAttempt()}>
                      {loading ? "Kaydediliyor..." : (attemptMode === "new" ? "Yeni Çağrıyı Oluştur" : "Değişiklikleri Kaydet")}
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </Card>

        <Card style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink }}>Notlar & Değerlendirme</div>
            <Button onClick={runEvaluate} disabled={evaluating}>
              {evaluating ? "Değerlendiriliyor..." : "🔎 Değerlendir (AI Özet)"}
            </Button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <textarea
              rows={2} value={noteBody} onChange={e => setNoteBody(e.target.value)}
              placeholder="Bu kişi hakkında gelişim/değerlendirme notu ekle..."
              style={{ flex: "1 1 260px", padding: "10px 13px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, fontFamily: FONT, resize: "vertical" }}
            />
            <Button onClick={addNote} disabled={loading || !noteBody.trim()}>Ekle</Button>
          </div>
          {notes.length === 0 ? (
            <div style={{ color: colors.muted, padding: 12, textAlign: "center" }}>Henüz not yok</div>
          ) : (
            notes.map(n => (
              <div key={n.id} style={{
                background: n.note_type === "ai_summary" ? colors.purpleBg : colors.surfaceAlt,
                border: n.note_type === "ai_summary" ? `1px solid ${colors.purpleBorder}` : `1px solid ${colors.border}`,
                borderRadius: 8, padding: 14, marginBottom: 10, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap"
              }}>
                <div style={{ fontSize: 11, color: colors.mutedLight, marginBottom: 6, fontWeight: 600 }}>
                  {n.note_type === "ai_summary" ? "AI Özeti" : "Admin Notu"} · {n.created_at}
                </div>
                {n.body}
              </div>
            ))
          )}
        </Card>

        {/* Rapor Modal */}
        {selectedReport && (
          <Modal onClose={() => { setSelectedReport(null); setSnapshots([]); setModalError(""); }} maxWidth={720}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink }}>Mülakat Raporu</div>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                  {selectedReport.name} · {selectedReport.email || "E-posta yok"} · {selectedReport.phone || "Telefon yok"}
                </div>
                {(() => {
                  // Form beyanı (candidates.education/university/department/experience_years) ile
                  // CV'den çıkarım (rapor gövdesi/Standart CV) bilinçli olarak ayrı tutulur — burada
                  // uzlaştırılmaz. Boş alan hiç gösterilmez; PDF'teki "BAŞVURU FORMU BEYANI" bloğuyla
                  // aynı kaynak mantığı.
                  const declared = [
                    selectedReport.education && `Eğitim: ${selectedReport.education}`,
                    selectedReport.experience_years ? `Deneyim: ${selectedReport.experience_years} yıl` : null,
                    selectedReport.university && `Üniversite: ${selectedReport.university}`,
                    selectedReport.department && `Bölüm: ${selectedReport.department}`,
                  ].filter(Boolean);
                  return declared.length > 0 ? (
                    <div style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>
                      <span style={{ fontWeight: 700, color: colors.yellow }}>Başvuru Formu Beyanı:</span> {declared.join(" · ")}
                    </div>
                  ) : null;
                })()}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="secondary" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => downloadPdf(selectedReport.candidate_id, selectedReport.name)}>PDF İndir</Button>
                <button onClick={() => { setSelectedReport(null); setSnapshots([]); setModalError(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: colors.muted, fontSize: 20 }}>✕</button>
              </div>
            </div>
            {modalError && <Alert>{modalError}</Alert>}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: colors.ink, marginBottom: 10, fontSize: 14 }}>Mülakat Sırasında Alınan Kareler ({snapshots.length}/4)</div>
              {snapshots.length === 0 && <div style={{ color: colors.muted, fontSize: 13, marginBottom: 8 }}>Henüz kayıtlı kamera karesi yok.</div>}
              {snapshots.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {snapshots.map(s => (
                    <img key={s.id} src={s.image_base64} alt="mülakat karesi" style={{ width: 110, height: 82, objectFit: "cover", borderRadius: 6, border: `1px solid ${colors.border}` }} />
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ background: colors.surfaceAlt, borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: colors.ink }}>{selectedReport.score ?? "-"}</div>
                <div style={{ fontSize: 12, color: colors.muted }}>/ 100</div>
              </div>
              <div style={{ background: colors.surfaceAlt, borderRadius: 8, padding: "12px 20px", textAlign: "center" }}>
                <Badge tone={REC_TONE[selectedReport.recommendation] || "neutral"}>{selectedReport.recommendation || "-"}</Badge>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>Öneri</div>
              </div>
            </div>
            {/* FAZ D: ortak rapor muhalif denetçisi çalışmadıysa görünür uyarı — sadece admin tarafı. */}
            {selectedReport.reviewer_status && selectedReport.reviewer_status !== "ok" && (
              <div style={{ marginBottom: 16 }}>
                <Alert>
                  {selectedReport.reviewer_status === "skipped"
                    ? "İkinci model (muhalif denetçi) bu raporda ÇALIŞMADI (atlandı)."
                    : "İkinci model (muhalif denetçi) bu raporda BAŞARISIZ oldu."}
                  {selectedReport.reviewer_error ? ` Neden: ${selectedReport.reviewer_error}` : ""}
                  {" "}Rapor yalnızca birincil modelin çıktısıdır; "Görüş Ayrılıkları" bölümü eksik olabilir.
                </Alert>
              </div>
            )}
            {selectedReport.usage_logs && selectedReport.usage_logs.length > 0 && (
              <div style={{ background: colors.surfaceAlt, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 14, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: colors.ink, marginBottom: 10 }}>AI Kullanım Logu</div>
                <div style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>
                  Toplam: {(selectedReport.usage_total_tokens || 0).toLocaleString("tr-TR")} token
                  {selectedReport.usage_cache_hit_pct != null && (
                    <> · Cache: <span style={{ fontWeight: 700, color: colors.green }}>%{selectedReport.usage_cache_hit_pct}</span> ({(selectedReport.usage_cached_input_tokens || 0).toLocaleString("tr-TR")} token)</>
                  )}
                  {" · "}<span style={{ fontWeight: 700, color: colors.ink }}>~${(selectedReport.usage_total_cost_usd || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                </div>
                {(() => {
                  // Action bazında kalem kalem döküm (FAZ D: mimik + denetçi ayrı satır olarak görünür).
                  const byAction = {};
                  for (const r of selectedReport.usage_logs) {
                    const k = r.action || "diğer";
                    if (!byAction[k]) byAction[k] = { calls: 0, tokens: 0, cost: 0, model: r.model };
                    byAction[k].calls += 1;
                    byAction[k].tokens += (r.total_tokens || 0);
                    byAction[k].cost += (r.estimated_cost_usd || 0);
                  }
                  const rows = Object.entries(byAction).sort((a, b) => b[1].cost - a[1].cost);
                  return (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: colors.muted, textAlign: "left" }}>
                            <th style={{ padding: "4px 8px" }}>Kalem</th>
                            <th style={{ padding: "4px 8px" }}>Model</th>
                            <th style={{ padding: "4px 8px", textAlign: "right" }}>Çağrı</th>
                            <th style={{ padding: "4px 8px", textAlign: "right" }}>Token</th>
                            <th style={{ padding: "4px 8px", textAlign: "right" }}>~$</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(([action, v]) => (
                            <tr key={action} style={{ borderTop: `1px solid ${colors.border}`, color: colors.inkSoft }}>
                              <td style={{ padding: "4px 8px" }}>{USAGE_ACTION_LABELS[action] || action}</td>
                              <td style={{ padding: "4px 8px" }}>{v.model || "-"}</td>
                              <td style={{ padding: "4px 8px", textAlign: "right" }}>{v.calls}</td>
                              <td style={{ padding: "4px 8px", textAlign: "right" }}>{v.tokens.toLocaleString("tr-TR")}</td>
                              <td style={{ padding: "4px 8px", textAlign: "right" }}>{v.cost.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}
            <ReportText text={selectedReport.report} />
            {selectedReport.ai_note && (
              <>
                <div style={{ fontWeight: 700, color: colors.ink, marginBottom: 10 }}>AI Notu / Özel Talimat</div>
                <pre style={{ background: colors.purpleBg, border: `1px solid ${colors.purpleBorder}`, borderRadius: 8, padding: 16, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7, fontFamily: FONT }}>{selectedReport.ai_note}</pre>
              </>
            )}
            {selectedReport.cv_text && (
              <>
                <div style={{ fontWeight: 700, color: colors.ink, marginBottom: 10 }}>Adayın Yüklediği CV {selectedReport.cv_filename ? `(${selectedReport.cv_filename})` : ""}</div>
                <pre style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7, maxHeight: 260, overflowY: "auto", fontFamily: FONT }}>{selectedReport.cv_text}</pre>
              </>
            )}
            {selectedReport.standard_cv && (
              <>
                <div style={{ fontWeight: 700, color: colors.ink, marginBottom: 10 }}>Standart CV (CV'den Çıkarım)</div>
                <pre style={{ background: colors.surfaceAlt, borderRadius: 8, padding: 16, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.7, fontFamily: FONT }}>{selectedReport.standard_cv}</pre>
              </>
            )}
          </Modal>
        )}

        {credModal && (
          <Modal onClose={() => setCredModal(null)} maxWidth={400}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>Giriş Bilgileri</div>
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>Mail gönderilemedi veya manuel iletmek istiyorsanız bu bilgileri kullanın.</div>
              <div style={{ background: colors.surfaceAlt, borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: colors.muted }}>Kullanıcı Adı</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: colors.ink }}>{credModal.username}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: colors.muted }}>Şifre</div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: colors.ink }}>{credModal.password}</div>
                </div>
              </div>
              <Button onClick={() => setCredModal(null)} style={{ width: "100%" }}>Kapat</Button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
