import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useProfile, useUpdateProfile } from "./useProfile";
import { signOut, updatePassword } from "@/services/authService";
import { deleteAccount, exportUserData } from "@/services/profileService";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { TextField, SelectField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import type { ScoreFormat, ThemePref, TitleLanguage } from "@/types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-base font-bold">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { data: profile, isLoading } = useProfile();

  if (isLoading || !profile) {
    return (
      <div className="flex justify-center py-16 text-signal">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 pb-8">
      <h1 className="font-display text-2xl font-bold">Settings</h1>
      <ProfileSection
        username={profile.username}
        avatarUrl={profile.avatarUrl ?? ""}
      />
      <PreferencesSection
        titleLanguage={profile.titleLanguage}
        scoreFormat={profile.scoreFormat}
        theme={profile.theme}
      />
      <Section title="AniList">
        <p className="text-sm text-ink-soft">
          Link your AniList account for two-way sync — import your lists and
          write progress back. Arrives in Phase 6.
        </p>
        <Button variant="secondary" disabled className="self-start">
          Link AniList
        </Button>
      </Section>
      <AccountSection />
      <DangerSection username={profile.username} />
    </div>
  );
}

function ProfileSection({
  username: initialUsername,
  avatarUrl: initialAvatarUrl,
}: {
  username: string;
  avatarUrl: string;
}) {
  const toast = useToast();
  const update = useUpdateProfile();
  const [username, setUsername] = useState(initialUsername);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      { username: username.trim(), avatarUrl: avatarUrl.trim() || null },
      {
        onSuccess: () => toast("Profile saved", "success"),
        onError: (err) =>
          toast(err instanceof Error ? err.message : "Save failed", "error"),
      },
    );
  }

  return (
    <Section title="Profile">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          hint="3–20 characters: letters, numbers, underscores."
        />
        <TextField
          label="Avatar URL"
          type="url"
          placeholder="https://…"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          hint="Image uploads come later; paste a link for now."
        />
        <Button type="submit" loading={update.isPending} className="self-start">
          Save changes
        </Button>
      </form>
    </Section>
  );
}

function PreferencesSection({
  titleLanguage,
  scoreFormat,
  theme,
}: {
  titleLanguage: TitleLanguage;
  scoreFormat: ScoreFormat;
  theme: ThemePref;
}) {
  const toast = useToast();
  const update = useUpdateProfile();

  function save(change: Partial<{ titleLanguage: TitleLanguage; scoreFormat: ScoreFormat; theme: ThemePref }>) {
    update.mutate(change, {
      onError: (err) =>
        toast(err instanceof Error ? err.message : "Save failed", "error"),
    });
  }

  return (
    <Section title="Preferences">
      <SelectField
        label="Title language"
        value={titleLanguage}
        onChange={(e) => save({ titleLanguage: e.target.value as TitleLanguage })}
        options={[
          { value: "ENGLISH", label: "English — Attack on Titan" },
          { value: "ROMAJI", label: "Romaji — Shingeki no Kyojin" },
          { value: "NATIVE", label: "Native — 進撃の巨人" },
        ]}
      />
      <SelectField
        label="Score format"
        value={scoreFormat}
        onChange={(e) => save({ scoreFormat: e.target.value as ScoreFormat })}
        options={[
          { value: "POINT_10_DECIMAL", label: "10-point with decimals (8.5)" },
          { value: "POINT_10", label: "10-point (8)" },
          { value: "POINT_5", label: "5-star (4.5★)" },
        ]}
        hint="Scores are stored on a 0–100 scale, so switching formats never loses data."
      />
      <SelectField
        label="Theme"
        value={theme}
        onChange={(e) => save({ theme: e.target.value as ThemePref })}
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
          { value: "system", label: "Match system" },
        ]}
      />
    </Section>
  );
}

function AccountSection() {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "export" | null>(null);

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast("Password needs at least 8 characters.", "error");
      return;
    }
    setBusy("password");
    try {
      await updatePassword(password);
      setPassword("");
      toast("Password updated", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function onExport() {
    if (!user) return;
    setBusy("export");
    try {
      const blob = await exportUserData(user.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `anitrack-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function onSignOut() {
    await signOut();
    navigate("/signin", { replace: true });
  }

  return (
    <Section title="Account">
      <form onSubmit={onChangePassword} className="flex flex-col gap-3">
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={busy === "password"}
          disabled={!password}
          className="self-start"
        >
          Change password
        </Button>
      </form>
      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <Button
          variant="secondary"
          onClick={() => void onExport()}
          loading={busy === "export"}
        >
          Export my data (JSON)
        </Button>
        <Button variant="ghost" onClick={() => void onSignOut()}>
          Sign out
        </Button>
      </div>
    </Section>
  );
}

function DangerSection({ username }: { username: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setBusy(true);
    try {
      await deleteAccount();
      // Local session is gone with the user; hard reload to a clean state.
      window.location.assign("/signin");
    } catch (err) {
      setBusy(false);
      toast(err instanceof Error ? err.message : "Deletion failed", "error");
    }
  }

  return (
    <Section title="Danger zone">
      <p className="text-sm text-ink-soft">
        Deletes your account and every row of your data — library, activity,
        notifications, AniList link. No undo.
      </p>
      <Button variant="danger" onClick={() => setOpen(true)} className="self-start">
        Delete account
      </Button>

      <Modal
        open={open}
        title="Delete account?"
        onClose={() => {
          setOpen(false);
          setConfirmText("");
        }}
      >
        <p className="text-sm text-ink-soft">
          This wipes everything, permanently. Type{" "}
          <strong className="text-ink">{username}</strong> to confirm.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <TextField
            label="Username"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={confirmText !== username}
              onClick={() => void onDelete()}
            >
              Delete everything
            </Button>
          </div>
        </div>
      </Modal>
    </Section>
  );
}
