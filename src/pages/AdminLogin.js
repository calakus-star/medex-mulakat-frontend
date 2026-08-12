import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Header, Card, Input, Button, Alert, Icon, colors } from "../components/Layout";
import { API_URL } from "../App";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const login = async () => {
    setLoading(true); setError("");
    try {
      const res = await axios.post(`${API_URL}/api/admin/login`, { email, password });
      localStorage.setItem("admin_token", res.data.token);
      navigate("/admin/panel");
    } catch (e) {
      setError(e.response?.data?.detail || "Giriş başarısız");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, marginTop: "8vh" }}>
        <Header subtitle="Admin Paneli" />
        <Card>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: colors.surfaceAlt, border: `1px solid ${colors.border}`,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
            }}>
              <Icon name="key" size={20} color={colors.inkSoft} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: colors.ink }}>Yönetici Girişi</div>
          </div>
          {error && <Alert>{error}</Alert>}
          <Input label="E-posta" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@medex-smo.com" />
          <Input label="Şifre" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()} placeholder="••••••••" />
          <Button style={{ width: "100%" }} disabled={loading || !email || !password} onClick={login}>
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
