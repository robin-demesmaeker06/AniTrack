import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./AuthProvider";
import { Spinner } from "@/components/ui/Spinner";

function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-signal">
      <Spinner size={28} />
    </div>
  );
}

/** Wraps authed routes; sends signed-out visitors to /signin. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session) {
    return <Navigate to="/signin" state={{ from: location.pathname }} replace />;
  }
  return <Outlet />;
}

/** Wraps auth pages; signed-in users go straight to the app. */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}
