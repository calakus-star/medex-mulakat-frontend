import { useState, useEffect, useCallback } from "react";
import apiClient, { formatApiError } from "../apiClient";
import { Card, Select, Button, Badge, Alert, colors } from "../components/Layout";
import { API_URL } from "../App";

// Adaya gösterilen (veya arka planda oluşan) AI hatalarının admin görünümü.
// Teknik detay ayrı, katlanabilir bir alanda tutulur; liste satırı insan dilinde açıklama gösterir.

const CLASS_LABELS = {
  insufficient_quota: "Kota / bakiye tükendi",
  invalid_api_key: "API anahtarı geçersiz",
  rate_limit_exceeded: "Hız sınırı (yoğunluk)",
  server_error: "Servis geçici hatası",
  network: "Ağ / bağlantı hatası",
  mic_permission: "Mikrofon izni",
  unknown: "Bilinmeyen hata",
};
const CLASS_TONE = {
  insufficient_quota: "red",
  invalid_api_key: "red",
  rate_limit_exceeded: "yellow",
  server_error: "yellow",
  network: "neutral",
  mic_permission: "neutral",
  unknown: "neutral",
};
const CRITICAL = new Set(["insufficient_quota", "invalid_api_key"]);

function formatDateTR(value) {
  if (!value) return "-";
  const d = new Date(String(value).replace(" ", "T"));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ErrorLogPanel({ token, initialCandidateId = "", onChange }) {
  const [logs, setLogs] = useState([]);
  const [unresolvedCritical, setUnresolvedCritical] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [candidateId, setCandidateId] = useState(initialCandidateId || "");
  const [errorClass, setErrorClass] = useState("");
  const [resolved, setResolved] = useState("");           // "" = hepsi, "0" = açık, "1" = çözülmüş
  const [includeBackground, setIncludeBackground] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo + " 23:59:59";
      if (candidateId) params.candidate_id = candidateId;
      if (errorClass) params.error_class = errorClass;
      if (resolved !== "") params.resolved = resolved;
      if (includeBackground) params.include_background = "1";
      const res = await apiClient.get(`${API_URL}/api/admin/error-logs`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setLogs(Array.isArray(res.data?.logs) ? res.data.logs : []);
      setUnresolvedCritical(res.data?.unresolved_critical || 0);
    } catch (e) {
      setError(formatApiError(e, "Hata kayıtları yüklenemedi").message);
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo, candidateId, errorClass, resolved, includeBackground]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const markResolved = async (id) => {
    try {
      await apiClient.post(`${API_URL}/api/admin/error-logs/${id}/resolve`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchLogs();
      if (onChange) onChange();
    } catch (e) {
      setError(formatApiError(e, "Kayıt güncellenemedi").message);
    }
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.ink }}>Hata Kayıtları</div>
          <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}>
            Adaya gösterilen AI hataları. Teknik detay her satırın içinde, ayrı alanda.
          </div>
        </div>
        <Button variant="secondary" onClick={fetchLogs} disabled={loading}>
          {loading ? "Yükleniyor..." : "Yenile"}
        </Button>
      </div>

      {unresolvedCritical > 0 && (
        <Alert type="error">
          {unresolvedCritical} çözülmemiş kritik hata var (kota tükenmesi veya geçersiz API anahtarı).
          Mülakatlar başlatılamıyor olabilir — sağlayıcı hesabını / anahtarını kontrol edin.
        </Alert>
      )}
      {error && <Alert type="error">{error}</Alert>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 8 }}>
        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>Başlangıç</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>Bitiş</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>Aday ID</label>
          <input type="number" value={candidateId} onChange={(e) => setCandidateId(e.target.value)} placeholder="tümü"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, boxSizing: "border-box" }} />
        </div>
        <Select label="Hata türü" value={errorClass} onChange={(e) => setErrorClass(e.target.value)}
          options={Object.keys(CLASS_LABELS).map((k) => ({ value: k, label: CLASS_LABELS[k] }))} />
        <Select label="Durum" value={resolved} onChange={(e) => setResolved(e.target.value)}
          options={[{ value: "0", label: "Açık" }, { value: "1", label: "Çözülmüş" }]} />
        <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 16 }}>
          <label style={{ fontSize: 13, color: colors.inkSoft, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={includeBackground} onChange={(e) => setIncludeBackground(e.target.checked)} />
            Arka plan hatalarını da göster
          </label>
        </div>
      </div>

      {logs.length === 0 && !loading && (
        <div style={{ padding: 28, textAlign: "center", color: colors.muted, fontSize: 14 }}>Kayıt bulunamadı.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {logs.map((log) => {
          const isOpen = expanded === log.id;
          return (
            <div key={log.id} style={{
              border: `1px solid ${CRITICAL.has(log.error_class) && !log.resolved ? "#ef4444" : colors.border}`,
              borderRadius: 10, overflow: "hidden",
            }}>
              <div onClick={() => setExpanded(isOpen ? null : log.id)}
                style={{ padding: "12px 14px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start", background: log.resolved ? colors.surfaceAlt : colors.surface }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <Badge tone={CLASS_TONE[log.error_class] || "neutral"}>{CLASS_LABELS[log.error_class] || log.error_class}</Badge>
                    {log.severity === "background" && <Badge tone="neutral">Arka plan</Badge>}
                    {log.resolved ? <Badge tone="green">Çözüldü</Badge> : <Badge tone="yellow">Açık</Badge>}
                    {log.retry_count > 0 && <Badge tone="neutral">{log.retry_count} yeniden deneme</Badge>}
                  </div>
                  <div style={{ fontSize: 14, color: colors.ink, lineHeight: 1.5 }}>{log.human_message}</div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>
                    {formatDateTR(log.created_at)}
                    {log.candidate_name ? ` · ${log.candidate_name}` : ""}
                    {log.candidate_id ? ` (#${log.candidate_id})` : ""}
                    {log.level ? ` · L${log.level}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: colors.muted, whiteSpace: "nowrap" }}>{isOpen ? "▲" : "▼"}</div>
              </div>

              {isOpen && (
                <div style={{ padding: "12px 14px", borderTop: `1px solid ${colors.border}`, background: colors.surfaceAlt }}>
                  <Row label="Adaya gösterilen mesaj" value={log.candidate_message} />
                  <Row label="Sağlayıcı / adım" value={`${log.provider || "-"} / ${log.step || "-"}`} />
                  <Row label="Mülakat ID" value={log.interview_id || "-"} />
                  {log.email_sent_at && <Row label="Bildirim e-postası" value={`Gönderildi — ${formatDateTR(log.email_sent_at)}`} />}
                  {log.resolved ? (
                    <Row label="Çözüldü" value={`${formatDateTR(log.resolved_at)}${log.resolved_by ? ` · ${log.resolved_by}` : ""}`} />
                  ) : null}
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 4 }}>Teknik detay (yalnızca yönetici)</div>
                    <pre style={{
                      margin: 0, padding: 12, background: "#0f172a", color: "#e2e8f0", borderRadius: 8,
                      fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflowY: "auto",
                    }}>{log.technical_detail || "—"}</pre>
                  </div>
                  {log.candidate_id && (
                    <div style={{ marginTop: 8, fontSize: 12.5 }}>
                      <a href={`/admin/panel?tab=errors&candidate=${log.candidate_id}`}
                        onClick={(e) => { e.preventDefault(); setCandidateId(String(log.candidate_id)); }}
                        style={{ color: colors.blue }}>Bu adayın tüm hataları</a>
                    </div>
                  )}
                  {!log.resolved && (
                    <div style={{ marginTop: 12 }}>
                      <Button onClick={() => markResolved(log.id)}>Çözüldü işaretle</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 13, marginBottom: 4 }}>
      <div style={{ minWidth: 160, color: colors.muted }}>{label}</div>
      <div style={{ color: colors.ink, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}
