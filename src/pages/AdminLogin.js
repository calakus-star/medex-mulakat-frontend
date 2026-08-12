import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Header, Card, Input, Button, Alert } from "../components/Layout";
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
    <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", flexDirection: "column", alignItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <Header subtitle="Admin Paneli" />
        <Card>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e3a5f" }}>Yönetici Girişi</div>
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
