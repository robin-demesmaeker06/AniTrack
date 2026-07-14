// delete-account — wipes every row belonging to the caller, then deletes
// the auth user. All user tables cascade from auth.users, so deleting the
// user is sufficient; RLS never applies because this runs as service role
// after the caller's JWT has been verified.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { captureError, flushSentry } from "../_shared/sentry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  // Explicit confirmation from the settings UI; guards against a stray
  // invoke deleting an account.
  confirm: z.literal(true),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let userId: string | undefined;
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(400, { error: "Invalid request body" });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return json(401, { error: "Missing authorization" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) {
      return json(401, { error: "Invalid session" });
    }
    userId = userData.user.id;

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return json(200, { ok: true });
  } catch (err) {
    captureError(err, userId);
    await flushSentry();
    return json(500, { error: "Account deletion failed" });
  }
});
