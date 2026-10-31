import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RegisterManagerPage from './pages/RegisterManagerPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ParticipatePage from './pages/ParticipatePage';
import VerifyStakeholderPage from './pages/VerifyStakeholderPage';
import DashboardPage from './pages/DashboardPage';
import UnauthorisedPage from './pages/UnauthorisedPage';
import DevOutboxPage from './pages/DevOutboxPage';
import ProtectedRoute from './components/ProtectedRoute';
import './index.css';

/* Conditionally render Navbar & Footer only on public pages */
function Layout() {
  const location = useLocation();
  const isAuthPage = [
    '/login',
    '/register',
    '/register/manager',
    '/activate-manager',
    '/reset-password',
    '/forgot-password',
    '/participate',
    '/verify-stakeholder',
    '/dev/outbox',
  ].includes(location.pathname);
  const isDashboard = location.pathname.startsWith('/dashboard');

  return (
    <>
      {!isAuthPage && !isDashboard && <Navbar />}
      <main style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/register/manager" element={<RegisterManagerPage />} />
          <Route path="/activate-manager" element={<RegisterManagerPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<ResetPasswordPage />} />
          <Route path="/participate" element={<ParticipatePage />} />
          <Route path="/verify-stakeholder" element={<VerifyStakeholderPage />} />
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/unauthorised" element={<UnauthorisedPage />} />
          <Route path="/dev/outbox" element={<DevOutboxPage />} />
          {/* Catch-all redirect to home */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      {!isAuthPage && !isDashboard && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Layout />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
