export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // IMPORTANT: type this header name exactly like this when testing:
  // x-admin-secret
  const adminSecret = req.headers["x-admin-secret"];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PUBLIC_APP_URL) {
    return res.status(500).json({
      error:
        "Missing env vars. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_APP_URL, ADMIN_SECRET",
    });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/households`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({}),
    });

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "Supabase insert failed",
        details: json,
      });
    }

    const row = Array.isArray(json) ? json[0] : json;
    const householdId = row?.id;

    if (!householdId) {
      return res.status(500).json({
        error: "Insert worked but no id returned",
        details: json,
      });
    }

    const url = `${PUBLIC_APP_URL}?h=${householdId}`;

    return res.status(200).json({
      householdId,
      url,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
