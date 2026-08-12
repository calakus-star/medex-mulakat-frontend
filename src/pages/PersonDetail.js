import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Header, Card, Button, Alert, Badge, colors, FONT } from "../components/Layout";
import { API_URL } from "../App";

const REC_TONE = { "İşe Al": "green", "Değerlendirmeye Al": "yellow", "Reddet": "red" };

const stripMarkdown = (value = "") => value
  .replace(/\*\*/g, "")
  .replace(/^\s*[-*]\s+/gm, "• ")
  .replace(/---RAPOR---|---RAPORSON---|---STANDARTCV---|---STANDARTCVSON---/g, "")
  .trim();

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
  const [expanded, setExpanded] = useState(null);
  const [reportsByCandidate, setReportsByCandidate] = useState({});

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchAll = async () => {
    try {
      const [personRes, notesRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/persons/${id}`, authHeaders),
        axios.get(`${API_URL}/api/admin/persons/${id}/notes`, authHeaders),
      ]);
      setDetail(personRes.data);
      setNotes(notesRes.data || []);
    } catch (e) {
      if (e.response?.status === 401) { navigate("/admin"); return; }
      setError(e.response?.data?.detail || "Kişi bilgileri yüklenemedi");
    }
  };

  useEffect(() => {
    if (!token) { navigate("/admin"); return; }
    fetchAll();
    // eslint-disable-next-line
  }, [id]);

  const toggleExpand = async (candidateId) => {
    if (expanded === candidateId) { setExpanded(null); return; }
    setExpanded(candidateId);
    if (!reportsByCandidate[candidateId]) {
      try {
        const res = await axios.get(`${API_URL}/api/admin/interviews/${candidateId}`, authHeaders);
        setReportsByCandidate(prev => ({ ...prev, [candidateId]: res.data }));
      } catch (e) {
        setReportsByCandidate(prev => ({ ...prev, [candidateId]: { report: "Rapor yüklenemedi." } }));
      }
    }
  };

  const addNote = async () => {
    if (!noteBody.trim()) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      await axios.post(`${API_URL}/api/admin/persons/${id}/notes`, { body: noteBody.trim() }, authHeaders);
      setNoteBody("");
      const notesRes = await axios.get(`${API_URL}/api/admin/persons/${id}/notes`, authHeaders);
      setNotes(notesRes.data || []);
      setSuccess("Not eklendi");
    } catch (e) {
      setError(e.response?.data?.detail || "Not eklenemedi");
    }
    setLoading(false);
  };

  const runEvaluate = async () => {
    setEvaluating(true); setError(""); setSuccess("");
    try {
      await axios.post(`${API_URL}/api/admin/persons/${id}/evaluate`, {}, authHeaders);
      const notesRes = await axios.get(`${API_URL}/api/admin/persons/${id}/notes`, authHeaders);
      setNotes(notesRes.data || []);
      setSuccess("Değerlendirme oluşturuldu");
    } catch (e) {
      setError(e.response?.data?.detail || "Değerlendirme oluşturulamadı");
    }
    setEvaluating(false);
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: colors.ink }}>
                      {a.position} · Level {a.level}
                      {a.is_archived ? <span style={{ marginLeft: 8, fontSize: 11, color: colors.mutedLight }}>(eski başvuru)</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: colors.muted }}>
                      {a.created_at} · {a.status === "completed" ? "Tamamlandı" : "Bekliyor"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {a.score !== null && a.score !== undefined && (
                      <div style={{ fontWeight: 700, color: colors.ink }}>{a.score}/100</div>
                    )}
                    {a.recommendation && (
                      <Badge tone={REC_TONE[a.recommendation] || "neutral"}>{a.recommendation}</Badge>
                    )}
                    {a.status === "completed" && (
                      <Button variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => toggleExpand(a.candidate_id)}>
                        {expanded === a.candidate_id ? "Gizle" : "Raporu Gör"}
                      </Button>
                    )}
                  </div>
                </div>
                {expanded === a.candidate_id && reportsByCandidate[a.candidate_id] && (
                  <div style={{ background: colors.surfaceAlt, borderRadius: 8, padding: 14, marginTop: 12, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                    {stripMarkdown(reportsByCandidate[a.candidate_id].report || "Rapor bulunamadı.")}
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
      </div>
    </div>
  );
}
