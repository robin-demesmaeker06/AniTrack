import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { signInWithEmail, signInWithGoogle } from "@/services/authService";
import { AuthLayout, Divider, GoogleButton } from "./AuthLayout";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Sign in">
      <GoogleButton onClick={() => void signInWithGoogle()} disabled={busy} />
      <Divider />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" loading={busy}>
          Sign in
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/forgot-password" className="text-ink-soft hover:text-signal">
          Forgot password?
        </Link>
        <Link to="/signup" className="text-signal hover:text-signal-strong">
          Create account
        </Link>
      </div>
    </AuthLayout>
  );
}
