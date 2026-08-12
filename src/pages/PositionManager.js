import { useState, useEffect } from "react";
import axios from "axios";
import { Card, Input, Select, Button, Alert } from "../components/Layout";
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
    const res = await axios.get(`${API_URL}/api/admin/positions`, { headers: { Authorization: `Bearer ${token}` } });
    setPositions(res.data);
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
        await axios.post(`${API_URL}/api/admin/positions`, payload, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.put(`${API_URL}/api/admin/positions/${editing}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      setEditing(null);
      fetchPositions();
    } catch (e) {
      setError(e.response?.data?.detail || "Hata oluştu");
    }
  };

  const deactivate = async (id) => {
    if (!window.confirm("Bu pozisyonu pasifleştirmek istediğine emin misin?")) return;
    await axios.delete(`${API_URL}/api/admin/positions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    fetchPositions();
  };

  if (editing !== null) {
    return (
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f", marginBottom: 16 }}>
          {editing === "new" ? "Yeni Pozisyon" : "Pozisyonu Düzenle"}
        </div>
        {error && <Alert>{error}</Alert>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Pozisyon Adı" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="örn: Saha Eczacısı" />
          <Select label="Kategori" options={categories} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1e3a5f", marginBottom: 6 }}>Görev Tanımı</label>
          <textarea
            value={form.role_description}
            onChange={e => setForm({ ...form, role_description: e.target.value })}
            rows={2}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "2px solid #e2e8f0", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }}
            placeholder="Bu pozisyonda kişi ne yapacak?"
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#1e3a5f" }}>Değerlendirme Kriterleri</label>
          <span style={{ fontSize: 13, fontWeight: 600, color: totalWeight === 100 ? "#22c55e" : "#f59e0b" }}>
            Toplam: {totalWeight}/100
          </span>
        </div>

        {form.criteria.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 80px 2fr 32px", gap: 8, marginBottom: 8, alignItems: "start" }}>
            <input
              value={c.name} onChange={e => updateCriterion(i, "name", e.target.value)}
              placeholder="Kriter adı (örn: Excel Yetkinliği)"
              style={{ padding: "10px 12px", borderRadius: 6, border: "2px solid #e2e8f0", fontSize: 13 }}
            />
            <input
              type="number" value={c.weight} onChange={e => updateCriterion(i, "weight", e.target.value)}
              placeholder="Puan"
              style={{ padding: "10px 12px", borderRadius: 6, border: "2px solid #e2e8f0", fontSize: 13 }}
            />
            <input
              value={c.desc} onChange={e => updateCriterion(i, "desc", e.target.value)}
              placeholder="Açıklama (örn: Pivot table, formül bilgisi)"
              style={{ padding: "10px 12px", borderRadius: 6, border: "2px solid #e2e8f0", fontSize: 13 }}
            />
            <button onClick={() => removeCriterion(i)} style={{ background: "#fef2f2", color: "#ef4444", border: "none", borderRadius: 6, cursor: "pointer", height: 38 }}>✕</button>
          </div>
        ))}
        <button onClick={addCriterion} style={{ background: "#f1f5f9", color: "#1e3a5f", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 20 }}>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f" }}>Pozisyonlar & Kriterler</div>
        <Button onClick={startNew}>+ Yeni Pozisyon</Button>
      </div>
      {positions.filter(p => p.active).map(pos => (
        <div key={pos.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, color: "#1e3a5f" }}>{pos.name}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{pos.category || "Genel"}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => startEdit(pos)} style={{ background: "#f1f5f9", color: "#1e3a5f", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Düzenle</button>
              <button onClick={() => deactivate(pos.id)} style={{ background: "#fef2f2", color: "#ef4444", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Pasifleştir</button>
            </div>
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>{pos.role_description}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pos.criteria.map((c, i) => (
              <span key={i} style={{ fontSize: 12, background: "#f8fafc", padding: "3px 10px", borderRadius: 12, color: "#1e3a5f" }}>
                {c.name} ({c.weight})
              </span>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}
