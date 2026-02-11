import crypto from "crypto";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // Admin protection (don't call this from your public webpage)
  const adminSecret = req.headers["x-admin-secret"];
  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: "Missing ADMIN_SECRET env var on server." });
  }
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  // Required env vars
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL) return res.status(500).json({ error: "Missing SUPABASE_URL env var." });
  if (!SERVICE_ROLE) return res.status(500).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY env var." });

  // Read optional label from body
  let label = null;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    label = typeof body.label === "string" ? body.label.trim() : null;
    if (label === "") label = null;
  } catch {
    // ignore JSON parse errors; label stays null
  }

  // Figure out your public app URL (prefer env var if you set it)
  const fallbackAppUrl = `https://${req.headers.host}`;
  const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || fallbackAppUrl).replace(/\/$/, "");

  try {
    // Generate an edit key (required by your NOT NULL constraint)
    const editKey = crypto.randomBytes(16).toString("hex");

    // Insert a new household row and return its id (uuid)
    const insertUrl = `${SUPABASE_URL}/rest/v1/households?select=id,label,edit_key`;

    const resp = await fetch(insertUrl, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        label,
        edit_key: editKey,
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(500).json({ error: `Supabase insert failed: ${text}` });
    }

    const rows = JSON.parse(text);
    const householdId = rows?.[0]?.id;
    const savedLabel = rows?.[0]?.label ?? label ?? "";
    const savedEditKey = rows?.[0]?.edit_key ?? editKey;

    if (!householdId) {
      return res.status(500).json({ error: "Insert worked but no household id returned." });
    }

    // Your app reads: ?h=HOUSEHOLD_UUID&k=EDIT_KEY
    const householdUrl =
      `${PUBLIC_APP_URL}/?h=${encodeURIComponent(householdId)}&k=${encodeURIComponent(savedEditKey)}`;

    // Simple QR image URL (no libraries needed)
    const qrPngUrl =
      `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(householdUrl)}`;

    return res.status(200).json({
      householdId,
      label: savedLabel,
      url: householdUrl,
      qrPngUrl,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
