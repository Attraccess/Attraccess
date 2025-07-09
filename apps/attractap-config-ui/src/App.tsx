import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { ThemeProvider } from './context/themeContext.provider';
import { AuthProvider } from './context/authContext.provider';
import { QueryProvider } from './services/queryProvider';
import { MainLayout } from './layouts/MainLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

export default function App() {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AuthProvider>
          <Router>
            <Routes>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Navigate to="/login\" replace />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="*" element={<Navigate to="/login\" replace />} />
              </Route>
            </Routes>
          </Router>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
