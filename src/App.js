import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import PersonDetail from "./pages/PersonDetail";
import CandidateLogin from "./pages/CandidateLogin";
import GeneralApply from "./pages/GeneralApply";
import Interview from "./pages/Interview";
import RealtimeInterview from "./pages/RealtimeInterview";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export { API_URL };

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/basvuru" />} />
        <Route path="/basvuru" element={<GeneralApply />} />
        <Route path="/mulakat" element={<CandidateLogin />} />
        <Route path="/mulakat/baslat" element={<Interview />} />
        <Route path="/mulakat/sesli" element={<RealtimeInterview />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/panel" element={<AdminDashboard />} />
        <Route path="/admin/panel/person/:id" element={<PersonDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
