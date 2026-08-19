import { useState, useEffect } from "react";
import apiClient, { formatApiError } from "../apiClient";
import { Card, Input, Select, Button, Alert, ChipButton, Badge, colors, FONT } from "../components/Layout";
import { API_URL } from "../App";

function emptyCriterion() {
  return { name: "", weight: 10, desc: "" };
}

export default function PositionManager({ token }) {
  const [positions, setPositions] = useState([]);
  const [editing, setEditing] = useState(null); // null = list, "new" = new form, id = editing
  const categories = ["Klinik Araştırma", "Medikal / Regülasyon", "Veri Yönetimi", "Kalite", "Laboratuvar", "Bilgi Teknolojileri", "İnsan Kaynakları", "Finans", "Satış & Pazarlama", "Genel"].map(c => ({ value: c, label: c }));
  const [form, setForm] = useState({ name: "", category: "Genel", role_description: "", criteria: [emptyCriterion()] });
  const [error, setError] = useState("");

  useEffect(() => { fetchPositions(); }, []);

  const fetchPositions = async () => {
    try {
      const res = await apiClient.get(`${API_URL}/api/admin/positions`, { headers: { Authorization: `Bearer ${token}` } });
      setPositions(res.data);
    } catch (e) {
      setError(formatApiError(e, "Pozisyonlar yüklenemedi").message);
    }
  };

  const totalWeight = form.criteria.reduce((s, c) => s + (parseInt(c.weight) || 0), 0);

  const startNew = () => {
    setForm({ name: "", category: "Genel", role_description: "", criteria: [emptyCriterion()] });
    setEditing("new");
    setError("");
  };

  const startEdit = (pos) => {
    setForm({ name: pos.name, category: pos.category || "Genel", role_description: pos.role_description, criteria: pos.criteria });
    setEditing(pos.id);
    setError("");
  };

  const addCriterion = () => setForm({ ...form, criteria: [...form.criteria, emptyCriterion()] });
  const removeCriterion = (i) => setForm({ ...form, criteria: form.criteria.filter((_, idx) => idx !== i) });
  const updateCriterion = (i, field, value) => {
    const updated = [...form.criteria];
    updated[i] = { ...updated[i], [field]: value };
    setForm({ ...form, criteria: updated });
  };

  const save = async () => {
    setError("");
    if (!form.name.trim()) { setError("Pozisyon adı gerekli"); return; }
    if (form.criteria.some(c => !c.name.trim())) { setError("Tüm kriterlere isim girilmeli"); return; }

    try {
      const payload = { name: form.name, category: form.category || "Genel", role_description: form.role_description, criteria: form.criteria.map(c => ({ ...c, weight: parseInt(c.weight) || 0 })) };
      if (editing === "new") {
        await apiClient.post(`${API_URL}/api/admin/positions`, payload, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await apiClient.put(`${API_URL}/api/admin/positions/${editing}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      setEditing(null);
      fetchPositions();
    } catch (e) {
      setError(formatApiError(e, "Pozisyon kaydedilemedi").message);
    }
  };

  const deactivate = async (id) => {
    if (!window.confirm("Bu pozisyonu pasifleştirmek istediğine emin misin?")) return;
    try {
      await apiClient.delete(`${API_URL}/api/admin/positions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchPositions();
    } catch (e) {
      setError(formatApiError(e, "Pozisyon pasifleştirilemedi").message);
    }
  };

  if (editing !== null) {
    return (
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink, marginBottom: 16 }}>
          {editing === "new" ? "Yeni Pozisyon" : "Pozisyonu Düzenle"}
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="admin-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Pozisyon Adı" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="örn: Saha Eczacısı" />
          <Select label="Kategori" options={categories} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: colors.inkSoft, marginBottom: 6 }}>Görev Tanımı</label>
          <textarea
            value={form.role_description}
            onChange={e => setForm({ ...form, role_description: e.target.value })}
            rows={2}
            style={{ width: "100%", padding: "10px 13px", borderRadius: 8, border: `1px solid ${colors.border}`, fontSize: 14, fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }}
            placeholder="Bu pozisyonda kişi ne yapacak?"
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: colors.inkSoft }}>Değerlendirme Kriterleri</label>
          <span style={{ fontSize: 13, fontWeight: 600, color: totalWeight === 100 ? colors.green : colors.yellow }}>
            Toplam: {totalWeight}/100
          </span>
        </div>

        {form.criteria.map((c, i) => (
          <div key={i} className="criteria-row" style={{ display: "grid", gridTemplateColumns: "2fr 80px 2fr 32px", gap: 8, marginBottom: 8, alignItems: "start" }}>
            <input
              value={c.name} onChange={e => updateCriterion(i, "name", e.target.value)}
              placeholder="Kriter adı (örn: Excel Yetkinliği)"
              style={{ padding: "10px 12px", borderRadius: 6, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: FONT, boxSizing: "border-box" }}
            />
            <input
              type="number" value={c.weight} onChange={e => updateCriterion(i, "weight", e.target.value)}
              placeholder="Puan"
              style={{ padding: "10px 12px", borderRadius: 6, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: FONT, boxSizing: "border-box" }}
            />
            <input
              value={c.desc} onChange={e => updateCriterion(i, "desc", e.target.value)}
              placeholder="Açıklama (örn: Pivot table, formül bilgisi)"
              style={{ padding: "10px 12px", borderRadius: 6, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily: FONT, boxSizing: "border-box" }}
            />
            <button onClick={() => removeCriterion(i)} style={{ background: colors.redBg, color: colors.red, border: "none", borderRadius: 6, cursor: "pointer", height: 38 }}>✕</button>
          </div>
        ))}
        <button onClick={addCriterion} style={{ background: colors.surfaceAlt, color: colors.ink, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 20, fontFamily: FONT }}>
          + Kriter Ekle
        </button>

        <div style={{ display: "flex", gap: 10 }}>
          <Button onClick={save}>Kaydet</Button>
          <Button variant="secondary" onClick={() => setEditing(null)}>İptal</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15.5, color: colors.ink }}>Pozisyonlar & Kriterler</div>
        <Button onClick={startNew}>+ Yeni Pozisyon</Button>
      </div>
      {positions.filter(p => p.active).map(pos => (
        <div key={pos.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, color: colors.ink }}>{pos.name}</div>
              <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{pos.category || "Genel"}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <ChipButton onClick={() => startEdit(pos)}>Düzenle</ChipButton>
              <ChipButton tone="red" onClick={() => deactivate(pos.id)}>Pasifleştir</ChipButton>
            </div>
          </div>
          <div style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>{pos.role_description}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pos.criteria.map((c, i) => (
              <Badge key={i}>{c.name} ({c.weight})</Badge>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}
