import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabaseClient";

export type { Session, User };

const CALLBACK_URL = `${window.location.origin}/auth/callback`;

export async function signUpWithEmail(
  email: string,
  password: string,
  username: string,
): Promise<{ needsVerification: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: CALLBACK_URL,
      // Picked up by the handle_new_user trigger to set the profile username.
      data: { username },
    },
  });
  if (error) throw error;
  return { needsVerification: !data.session };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: CALLBACK_URL },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getSupabase().auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export function onAuthStateChange(
  callback: (session: Session | null) => void,
): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}
