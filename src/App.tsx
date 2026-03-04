import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import TherapistList from './modules/therapists/TherapistList';
import PatientList from './modules/patients/PatientList';
import CalendarView from './modules/calendar/CalendarView';
import BillingView from './modules/billing/BillingView';
import AdminView from './modules/admin/AdminView';
import WaitingList from './modules/patients/WaitingList';


import { AuthProvider } from './context/AuthContext';


function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="therapists" element={<TherapistList />} />
            <Route path="patients" element={<PatientList />} />
            <Route path="waiting-list" element={<WaitingList />} />
            <Route path="billing" element={<BillingView />} />
            <Route path="admin" element={<AdminView />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
