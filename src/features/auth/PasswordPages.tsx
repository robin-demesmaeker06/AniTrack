import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { requestPasswordReset, updatePassword } from "@/services/authService";
import { AuthLayout } from "./AuthLayout";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset your password">
      {sent ? (
        <p className="text-sm text-ink-soft">
          If an account exists for {email}, a reset link is on its way. Check
          your inbox.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <Button type="submit" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm">
        <Link to="/signin" className="text-ink-soft hover:text-signal">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

/**
 * Landing page for the recovery link. Supabase has already exchanged the
 * link for a session by the time this renders (detectSessionInUrl), so the
 * user just sets a new password.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update the password. The link may have expired — request a new one.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" loading={busy}>
          Save new password
        </Button>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  return (
    <AuthLayout title="Check your inbox">
      <p className="text-sm text-ink-soft">
        We sent a verification link to your email address. Click it, and
        you'll land back here signed in.
      </p>
      <p className="mt-4 text-sm">
        <Link to="/signin" className="text-signal hover:text-signal-strong">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
