import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { CartProvider } from './contexts/CartContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import Gallery from './pages/Gallery'
import Appointments from './pages/Appointments'
import Store from './pages/Store'
import Stylists from './pages/Stylists'
import Login from './pages/Login'
import Register from './pages/Register'
import Profile from './pages/Profile'
import ResetPassword from './pages/ResetPassword'
import Chat from './pages/Chat'
import StudioGate from './pages/studio/StudioGate'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AdminRoute from './components/auth/AdminRoute'
import AdminOnlyRoute from './components/auth/AdminOnlyRoute'
import ManagerRoute from './components/auth/ManagerRoute'

// The studio is only for staff, so its code is downloaded on first visit
const StudioLayout = lazy(() => import('./pages/studio/StudioLayout'))
const StudioDashboard = lazy(() => import('./pages/studio/StudioDashboard'))
const StudioProducts = lazy(() => import('./pages/studio/StudioProducts'))
const StudioGallery = lazy(() => import('./pages/studio/StudioGallery'))
const StudioMessages = lazy(() => import('./pages/studio/StudioMessages'))
const StudioCoupons = lazy(() => import('./pages/studio/StudioCoupons'))
const StudioUsers = lazy(() => import('./pages/studio/StudioUsers'))
const StudioServices = lazy(() => import('./pages/studio/StudioServices'))
const StudioStylists = lazy(() => import('./pages/studio/StudioStylists'))
const StudioBlockedDates = lazy(() => import('./pages/studio/StudioBlockedDates'))
const StudioSales = lazy(() => import('./pages/studio/StudioSales'))
const StudioAppointmentsList = lazy(() => import('./pages/studio/StudioAppointmentsList'))
const StudioSchedule = lazy(() => import('./pages/studio/StudioSchedule'))
const StudioOrders = lazy(() => import('./pages/studio/StudioOrders'))
const StudioHomeDisplay = lazy(() => import('./pages/studio/StudioHomeDisplay'))
const StudioTimesheets = lazy(() => import('./pages/studio/StudioTimesheets'))
const StudioPayRuns = lazy(() => import('./pages/studio/StudioPayRuns'))
const StudioPaysheet = lazy(() => import('./pages/studio/StudioPaysheet'))
const StudioLogs = lazy(() => import('./pages/studio/StudioLogs'))

const studioFallback = (
  <div className="min-h-screen flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-[#B8D4E8]/30 border-t-[#B8D4E8] rounded-full animate-spin" />
  </div>
)

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a1a1a',
              color: '#f5f5f5',
              border: '1px solid rgba(184,212,232,0.2)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#B8D4E8', secondary: '#0a0a0a' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#0a0a0a' } },
          }}
        />
        <Routes>
          {/* Public routes with main layout */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="store" element={<Store />} />
            <Route path="stylists" element={<Stylists />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="reset-password" element={<ResetPassword />} />
          </Route>

          {/* Studio (admin) routes */}
          <Route path="/studio" element={<StudioGate />} />
          <Route path="/studio/*" element={<AdminRoute><Suspense fallback={studioFallback}><StudioLayout /></Suspense></AdminRoute>}>
            <Route path="dashboard"    element={<StudioDashboard />} />
            <Route path="appointments" element={<StudioAppointmentsList />} />
            <Route path="schedule"     element={<StudioSchedule />} />
            <Route path="sales"        element={<AdminOnlyRoute><StudioSales /></AdminOnlyRoute>} />
            <Route path="blocked-dates" element={<AdminRoute><StudioBlockedDates /></AdminRoute>} />
            <Route path="services"  element={<AdminOnlyRoute><StudioServices /></AdminOnlyRoute>} />
            <Route path="stylists"  element={<AdminOnlyRoute><StudioStylists /></AdminOnlyRoute>} />
            <Route path="products"  element={<ManagerRoute><StudioProducts /></ManagerRoute>} />
            <Route path="orders"    element={<AdminRoute><StudioOrders /></AdminRoute>} />
            <Route path="gallery"   element={<ManagerRoute><StudioGallery /></ManagerRoute>} />
            <Route path="messages"  element={<AdminRoute><StudioMessages /></AdminRoute>} />
            <Route path="coupons"   element={<ManagerRoute><StudioCoupons /></ManagerRoute>} />
            <Route path="users"        element={<AdminOnlyRoute><StudioUsers /></AdminOnlyRoute>} />
            <Route path="home-display" element={<AdminOnlyRoute><StudioHomeDisplay /></AdminOnlyRoute>} />
            <Route path="timesheets"  element={<AdminRoute><StudioTimesheets /></AdminRoute>} />
            <Route path="pay-runs"    element={<AdminOnlyRoute><StudioPayRuns /></AdminOnlyRoute>} />
            <Route path="paysheet"    element={<AdminRoute><StudioPaysheet /></AdminRoute>} />
            <Route path="logs"        element={<AdminOnlyRoute><StudioLogs /></AdminOnlyRoute>} />
          </Route>
        </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  )
}
