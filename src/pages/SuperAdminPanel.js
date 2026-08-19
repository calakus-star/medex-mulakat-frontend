import { useState, useEffect } from "react";
import apiClient, { formatApiError } from "../apiClient";
import { Card, Input, Button, Alert, colors } from "../components/Layout";
import { API_URL } from "../App";

export default function SuperAdminPanel({ token }) {
  const [orgs, setOrgs] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const [showOrgForm, setShowOrgForm] = useState(false);
  const [orgForm, setOrgForm] = useState({ name: "", slug: "" });

  const [expandedOrg, setExpandedOrg] = useState(null);
  const [orgAdmins, setOrgAdmins] = useState({});
  const [adminFormFor, setAdminFormFor] = useState(null);
  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "" });
  const [credModal, setCredModal] = useState(null);

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchOrgs = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/api/superadmin/organizations`, authHeaders);
      setOrgs(res.data || []);
    } catch (e) {
      setError(formatApiError(e, "Kurumlar yüklenemedi").message);
    }
  };

  useEffect(() => { fetchOrgs(); }, []);

  const createOrg = async () => {
    if (!orgForm.name.trim() || !orgForm.slug.trim()) return;
    setLoading(true); setError(""); setSuccess("");
    try {
      await apiClient.post(`${API_URL}/api/superadmin/organizations`, orgForm, authHeaders);
      setSuccess(`"${orgForm.name}" kurumu oluşturuldu, pozisyon kataloğu MedeX şablonundan kopyalandı.`);
      setOrgForm({ name: "", slug: "" });
      setShowOrgForm(false);
      fetchOrgs();
    } catch (e) {
      setError(formatApiError(e, "Kurum oluşturulamadı").message);
    }
    setLoading(false);
  };

  const toggleExpand = async (orgId) => {
    if (expandedOrg === orgId) { setExpandedOrg(null); return; }
    setExpandedOrg(orgId);
    setAdminFormFor(null);
    if (!orgAdmins[orgId]) {
      try {
        const res = await apiClient.get(`${API_URL}/api/superadmin/organizations/${orgId}/admins`, authHeaders);
        setOrgAdmins(prev => ({ ...prev, [orgId]: res.data || [] }));
      } catch (e) {
        setOrgAdmins(prev => ({ ...prev, [orgId]: [] }));
        setError(formatApiError(e, "Kurum adminleri yüklenemedi").message);
      }
    }
  };

  const startAdminForm = (orgId) => {
    setAdminFormFor(orgId);
    setAdminForm({ name: "", email: "", password: "" });
    setError("");
  };

  const createAdmin = async (orgId) => {
    if (!adminForm.name.trim() || !adminForm.email.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await apiClient.post(`${API_URL}/api/superadmin/organizations/${orgId}/admins`, adminForm, authHeaders);
      setCredModal(res.data);
      setAdminFormFor(null);
      const refreshed = await apiClient.get(`${API_URL}/api/superadmin/organizations/${orgId}/admins`, authHeaders);
      setOrgAdmins(prev => ({ ...prev, [orgId]: refreshed.data || [] }));
      fetchOrgs();
    } catch (e) {
      setError(formatApiError(e, "Admin oluşturulamadı").message);
    }
    setLoading(false);
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink }}>Kurumlar (Süperadmin)</div>
        <Button onClick={() => setShowOrgForm(v => !v)}>{showOrgForm ? "İptal" : "+ Yeni Kurum"}</Button>
      </div>
      <div style={{ fontSize: 13, color: colors.muted, marginBottom: 16 }}>
        Platformdaki tüm kurumlar. Her yeni kurum, MedeX'in hazır pozisyon kataloğunun bağımsız bir kopyasıyla başlar.
      </div>
      {error && <Alert>{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {showOrgForm && (
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Kurum Adı" value={orgForm.name} onChange={e => setOrgForm({ ...orgForm, name: e.target.value })} placeholder="Acme A.Ş." />
            <Input label="Slug (benzersiz kısa isim)" value={orgForm.slug} onChange={e => setOrgForm({ ...orgForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="acme" />
          </div>
          <Button disabled={loading || !orgForm.name.trim() || !orgForm.slug.trim()} onClick={createOrg}>
            {loading ? "Oluşturuluyor..." : "Kurumu Oluştur"}
          </Button>
        </div>
      )}

      {orgs.length === 0 ? (
        <div style={{ textAlign: "center", color: colors.muted, padding: 40 }}>Henüz kurum yok</div>
      ) : (
        orgs.map(org => (
          <div key={org.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, color: colors.ink }}>
                  {org.name} <span style={{ fontWeight: 400, color: colors.muted, fontSize: 12 }}>({org.slug})</span>
                </div>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {org.admin_count} admin · {org.candidate_count} aday · {org.created_at}
                </div>
              </div>
              <Button variant="secondary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => toggleExpand(org.id)}>
                {expandedOrg === org.id ? "Gizle" : "Adminleri Gör"}
              </Button>
            </div>

            {expandedOrg === org.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.inkSoft }}>Kurum Adminleri</div>
                  <Button variant="secondary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => startAdminForm(org.id)}>
                    + Yeni Admin
                  </Button>
                </div>
                {(orgAdmins[org.id] || []).length === 0 ? (
                  <div style={{ color: colors.muted, fontSize: 13, padding: 8 }}>Bu kurumda henüz admin yok</div>
                ) : (
                  (orgAdmins[org.id] || []).map(a => (
                    <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: colors.ink }}>{a.name}</span>
                        <span style={{ color: colors.muted }}> · {a.email}</span>
                      </div>
                      <span style={{ color: colors.muted, fontSize: 12 }}>{a.created_at}</span>
                    </div>
                  ))
                )}

                {adminFormFor === org.id && (
                  <div style={{ marginTop: 14 }}>
                    <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <Input label="Ad Soyad" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} placeholder="Ayşe Yılmaz" />
                      <Input label="E-posta" type="email" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} placeholder="ayse@kurum.com" />
                      <Input label="Şifre (boş bırakılırsa otomatik üretilir)" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} placeholder="opsiyonel" />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button disabled={loading || !adminForm.name.trim() || !adminForm.email.trim()} onClick={() => createAdmin(org.id)}>
                        {loading ? "Oluşturuluyor..." : "Admini Oluştur"}
                      </Button>
                      <Button variant="secondary" onClick={() => setAdminFormFor(null)}>İptal</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}

      {credModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,19,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: colors.surface, borderRadius: 12, padding: 28, maxWidth: 380, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>Kurum Admini Oluşturuldu</div>
            <div style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>Bu bilgileri kurum adminine iletin.</div>
            <div style={{ background: colors.surfaceAlt, borderRadius: 8, padding: 20, marginBottom: 20 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: colors.muted }}>E-posta</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: colors.ink }}>{credModal.email}</div>
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
