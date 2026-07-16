import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "@/components/ui/sonner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Shell } from "@/components/Shell";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import Company from "@/pages/Company";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

function AppRouter() {
  const location = useLocation();
  // Handle OAuth session_id in URL fragment before any protected route runs
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireOnboarding={false}>
            <Onboarding />
          </ProtectedRoute>
        }
      />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Shell><Dashboard /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/chat"
        element={
          <ProtectedRoute>
            <Shell><Chat /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/chat/:conversationId"
        element={
          <ProtectedRoute>
            <Shell><Chat /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/company"
        element={
          <ProtectedRoute>
            <Shell><Company /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/history"
        element={
          <ProtectedRoute>
            <Shell><History /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/settings"
        element={
          <ProtectedRoute>
            <Shell><Settings /></Shell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/admin"
        element={
          <ProtectedRoute>
            <Shell><Admin /></Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppRouter />
              <Toaster position="top-center" richColors closeButton />
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </div>
  );
}
