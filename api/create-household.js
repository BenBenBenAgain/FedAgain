export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // Simple admin protection (do NOT call this from your public webpage)
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

  // Figure out your public app URL (prefer env var if you set it)
  const fallbackAppUrl = `https://${req.headers.host}`;
  const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || fallbackAppUrl).replace(/\/$/, "");

  // Optional label from request body
  let label = null;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (typeof body.label === "string" && body.label.trim()) label = body.label.trim();
    if (typeof body.name === "string" && body.name.trim()) label = body.name.trim(); // backward compat
  } catch {
    // ignore body parse errors
  }

  try {
    // Insert a new household row and return its id + label
    const insertUrl = `${SUPABASE_URL}/rest/v1/households?select=id,label,edit_key`;

    const resp = await fetch(insertUrl, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ label }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(500).json({ error: `Supabase insert failed: ${text}` });
    }

    const rows = JSON.parse(text);
    const householdId = rows?.[0]?.id;
    const editKey = rows?.[0]?.edit_key;
    const savedLabel = rows?.[0]?.label ?? null;

    if (!householdId) {
      return res.status(500).json({ error: "Insert worked but no household id returned." });
    }
    if (!editKey) {
      return res.status(500).json({ error: "Insert worked but no edit_key returned." });
    }

    const householdUrl =
      `${PUBLIC_APP_URL}/?h=${encodeURIComponent(householdId)}&k=${encodeURIComponent(editKey)}`;

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
