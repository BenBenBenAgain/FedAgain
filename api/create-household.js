import crypto from "crypto";

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // Admin protection
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

  // Public app URL
  const fallbackAppUrl = `https://${req.headers.host}`;
  const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || fallbackAppUrl).trim().replace(/\/$/, "");

  try {
    // Create edit key for this household
    const editKey = crypto.randomBytes(16).toString("hex");

    // Insert household with edit_key and return id + edit_key
    const insertUrl = `${SUPABASE_URL}/rest/v1/households?select=id,edit_key`;

    const resp = await fetch(insertUrl, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ edit_key: editKey }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(500).json({ error: `Supabase insert failed: ${text}` });
    }

    const rows = JSON.parse(text);
    const householdId = rows?.[0]?.id;
    const returnedKey = rows?.[0]?.edit_key;

    if (!householdId || !returnedKey) {
      return res.status(500).json({ error: "Insert worked but no household id / key returned." });
    }

    // URL includes both h and k
    const householdUrl =
      `${PUBLIC_APP_URL}/?h=${encodeURIComponent(householdId)}&k=${encodeURIComponent(returnedKey)}`;

    // QR image URL
    const qrPngUrl =
      `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(householdUrl)}`;

    return res.status(200).json({
      householdId,
      url: householdUrl,
      qrPngUrl,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
