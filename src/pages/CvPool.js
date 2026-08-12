import { useState, useEffect } from "react";
import axios from "axios";
import { Card, Select, Button, Alert, Icon, colors } from "../components/Layout";
import { API_URL } from "../App";

export default function CvPool({ token }) {
  const [pool, setPool] = useState([]);
  const [positionsRaw, setPositionsRaw] = useState([]);
  const [error, setError] = useState("");
  const [expandedCv, setExpandedCv] = useState(null);
  const [inviteFor, setInviteFor] = useState(null); // candidate_id
  const [inviteForm, setInviteForm] = useState({ position: "", level: 1 });
  const [loading, setLoading] = useState(false);
  const [credModal, setCredModal] = useState(null);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchPool = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/cv-pool`, authHeaders);
      setPool(res.data || []);
    } catch (e) {
      setError(e.response?.data?.detail || "Havuz yüklenemedi");
    }
  };

  useEffect(() => {
    fetchPool();
    axios.get(`${API_URL}/api/admin/positions`, authHeaders).then(res => {
      setPositionsRaw((Array.isArray(res.data) ? res.data : []).filter(p => p.active));
    });
    // eslint-disable-next-line
  }, []);

  const positionOptions = positionsRaw.map(p => ({ value: p.name, label: p.name }));

  const startInvite = (candidateId) => {
    setInviteFor(candidateId);
    setInviteForm({ position: "", level: 1 });
    setError("");
  };

  const sendInvite = async () => {
    if (!inviteForm.position) return;
    setLoading(true); setError("");
    try {
      const res = await axios.post(`${API_URL}/api/admin/cv-pool/${inviteFor}/invite`, inviteForm, authHeaders);
      setCredModal(res.data);
      setInviteFor(null);
      fetchPool();
    } catch (e) {
      setError(e.response?.data?.detail || "Davet gönderilemedi");
    }
    setLoading(false);
  };

  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink, marginBottom: 4 }}>CV Havuzu</div>
      <div style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>
        Genel başvuru ile üye olmuş, henüz hiçbir kuruma davet edilmemiş kişiler. Bu havuz tüm kurumlara ortaktır.
      </div>
      {error && <Alert>{error}</Alert>}

      {pool.length === 0 ? (
        <div style={{ textAlign: "center", color: colors.muted, padding: 40 }}>Havuzda henüz kimse yok</div>
      ) : (
        pool.map(p => (
          <div key={p.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, color: colors.ink }}>{p.name}</div>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {p.email || "-"} {p.phone ? `· ${p.phone}` : ""} · İlgilendiği pozisyon: {p.position}
                </div>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {p.education || "-"} {p.university ? `· ${p.university}` : ""} {p.department ? `· ${p.department}` : ""}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center" }}>
                  {p.cv_filename ? (
                    <button onClick={() => setExpandedCv(expandedCv === p.id ? null : p.id)}
                      style={{ background: "none", border: "none", color: colors.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                      {expandedCv === p.id ? "CV'yi gizle" : `CV'yi göster (${p.cv_filename})`}
                    </button>
                  ) : <span style={{ fontSize: 12, color: colors.mutedLight }}>CV yok</span>}
                  {p.ai_note && <span style={{ fontSize: 12, color: colors.purple, fontWeight: 600 }}>Ek not var</span>}
                </div>
              </div>
              <Button onClick={() => startInvite(p.id)}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name="plus" size={14} />Kurumuma Davet Et
                </span>
              </Button>
            </div>
            {expandedCv === p.id && p.cv_text && (
              <pre style={{ background: colors.surfaceAlt, borderRadius: 8, padding: 14, marginTop: 12, fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 220, overflowY: "auto" }}>
                {p.cv_text}
              </pre>
            )}
            {p.ai_note && (
              <div style={{ background: colors.purpleBg, border: `1px solid ${colors.purpleBorder}`, borderRadius: 8, padding: 12, marginTop: 12, fontSize: 12.5, color: colors.inkSoft }}>
                {p.ai_note}
              </div>
            )}
            {inviteFor === p.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }} className="admin-form-grid">
                  <Select
                    label="Pozisyon"
                    options={positionOptions}
                    value={inviteForm.position}
                    onChange={e => setInviteForm({ ...inviteForm, position: e.target.value })}
                  />
                  <Select
                    label="Mülakat Seviyesi"
                    options={[{ value: 1, label: "Level 1" }, { value: 2, label: "Level 2" }, { value: 3, label: "Level 3" }]}
                    value={inviteForm.level}
                    onChange={e => setInviteForm({ ...inviteForm, level: parseInt(e.target.value, 10) })}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button disabled={loading || !inviteForm.position} onClick={sendInvite}>{loading ? "Gönderiliyor..." : "Daveti Gönder"}</Button>
                  <Button variant="secondary" onClick={() => setInviteFor(null)}>İptal</Button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {credModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,19,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: colors.surface, borderRadius: 12, padding: 28, maxWidth: 380, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>Davet Gönderildi</div>
            <div style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>
              {credModal.mail_sent ? "Giriş bilgileri mail ile gönderildi." : "Mail gönderilemedi, bilgileri manuel iletin."}
            </div>
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
        </div>
      )}
    </Card>
  );
}
