import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { signUpWithEmail, signInWithGoogle } from "@/services/authService";
import { AuthLayout, Divider, GoogleButton } from "./AuthLayout";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function SignUpPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!USERNAME_RE.test(username)) {
      setError("Usernames are 3–20 characters: letters, numbers, underscores.");
      return;
    }
    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { needsVerification } = await signUpWithEmail(
        email,
        password,
        username,
      );
      navigate(needsVerification ? "/verify-email" : "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account">
      <GoogleButton onClick={() => void signInWithGoogle()} disabled={busy} />
      <Divider />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Username"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          hint="3–20 characters: letters, numbers, underscores."
        />
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" loading={busy}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-sm text-ink-soft">
        Already have an account?{" "}
        <Link to="/signin" className="text-signal hover:text-signal-strong">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
