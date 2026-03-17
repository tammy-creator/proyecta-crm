import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import TherapistList from './modules/therapists/TherapistList';
import PatientList from './modules/patients/PatientList';
import CalendarView from './modules/calendar/CalendarView';
import BillingView from './modules/billing/BillingView';
import AdminView from './modules/admin/AdminView';
import WaitingList from './modules/patients/WaitingList';
import LoginPage from './pages/LoginPage';
import RequireAuth from './components/layout/RequireAuth';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pantalla de espera mientras se comprueba la sesión
const AppRoutes = () => {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f4f8'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: '3px solid #bce4ea',
            borderTopColor: '#1A5F7A',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Cargando...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Ruta pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Rutas protegidas */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/calendar" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="calendar" element={<CalendarView />} />
        <Route path="therapists" element={<TherapistList />} />
        <Route path="patients" element={<PatientList />} />
        <Route path="waiting-list" element={<WaitingList />} />
        <Route path="billing" element={<BillingView />} />
        <Route path="admin" element={<AdminView />} />
      </Route>

      {/* Cualquier ruta desconocida → inicio */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
