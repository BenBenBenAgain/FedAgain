export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  // Admin protection
  const adminSecret = req.headers["x-admin-secret"];
  if (!process.env.ADMIN_SECRET) {
    return res.status(500).json({ error: "Missing ADMIN_SECRET env var on server." });
  }
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL) return res.status(500).json({ error: "Missing SUPABASE_URL env var." });
  if (!SERVICE_ROLE) return res.status(500).json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY env var." });

  // Pull recent households (newest first)
  const select =
    "id,label,edit_key,created_at,last_fed_at,last_walked_at";

  const url =
    `${SUPABASE_URL}/rest/v1/households?select=${encodeURIComponent(select)}&order=created_at.desc&limit=200`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(500).json({ error: `Supabase fetch failed: ${text}` });
    }

    const rows = JSON.parse(text);
    return res.status(200).json({ households: rows });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
