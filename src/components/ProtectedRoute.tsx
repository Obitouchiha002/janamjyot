import { Navigate } from "react-router-dom";
import { Compass } from "lucide-react";
import { useAuth } from "@/auth";
import type { ReactNode } from "react";

/** Gate a route behind login (and optionally admin role). */
export default function ProtectedRoute({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="text-center py-24 text-muted-foreground flex flex-col items-center"><Compass className="animate-spin h-8 w-8 mb-4" />Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
