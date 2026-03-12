import { Routes, Route, Navigate } from 'react-router-dom'
import { Header } from './components/Header.js'
import { HomePage } from './pages/HomePage.js'
import { AdminPage } from './pages/AdminPage.js'
import { AnalyticsPage } from './pages/AnalyticsPage.js'

export function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
      <Header />
      <div className="flex flex-col flex-1 min-h-0">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}
