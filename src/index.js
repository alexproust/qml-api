export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders() });
      }

      const authErr = checkAuth(request, env);
      if (authErr) return json(authErr, 401);

      const url = new URL(request.url)

      // GET all costumes
      if (request.method === "GET" && url.pathname === "/costume") {
        const result = await env.DB.prepare(
          "SELECT * FROM costume"
        ).all()

        return json(result.results)
      }

      // GET /costume/{id}
      if (request.method === "GET" && url.pathname.startsWith("/costume/")) {
        try {
          const parts = url.pathname.split("/")
          const id = parts[2]

          if (!id) {
            return json({ error: "Missing ID" }, 400)
          }

          const result = await env.DB
            .prepare("SELECT * FROM costume WHERE id is ? order by rowid desc")
            .bind(Number(id))
            .first()

          if (!result) {
            return json({ error: "Not found" }, 404)
          }

          return json(result)

        } catch (err) {
          return new Response("GET costume by id error: " + err.message, {
            status: 500
          })
        }
      }

      // GET /adherent
      if (request.method === "GET" && url.pathname === "/adherent") {
        const result = await env.DB.prepare(
          "SELECT * FROM adherent"
        ).all()

        return json(result.results)
      }

      // POST /costume
      if (request.method === "POST" && url.pathname === "/costume") {
        try {
          let body;
          try {
            body = await request.json();
          } catch {
            return json({ error: "Invalid JSON" }, 400);
          }

          let result
          if (body.type) {
            const { type, description, genre, mode, epoque, couleur, taille, etat } = body;
            result = await env.DB.prepare(
              'INSERT INTO costume VALUES(NULL,?,?,?,?,?,?,?,?,"","","","","")'
            ).bind(type, description, genre, mode, epoque, couleur, taille, etat)
              .run()
          }
          else {
            result = await env.DB.prepare(
              'INSERT INTO costume VALUES(NULL,"","","","","","","","","","","","","")'
            ).run()
          }

          if (!result) {
            return json({ error: "DB error", details: r }, 500);
          }

          const rawId = result.meta.last_row_id
          let newId = Number(rawId)
          let result_select
          let newIdString = ""
          do {
            newId = newId + 1
            newIdString = newId + ".0"
            result_select = await env.DB
              .prepare("SELECT 1 AS exists_flag FROM costume WHERE id = ? ORDER BY rowid DESC")
              .bind(newIdString)
              .first()
          } while (result_select);

          await env.DB.prepare(
            "UPDATE costume SET id = ? WHERE rowid = ?"
          ).bind(newId, rawId).run()

          const responseBody = {
            status: "ok",
            id: Number(newId)
          }

          return json(responseBody)

        } catch (err) {
          return json({ error: err.message }, 500)
        }
      }

      // PUT /api/costume/:id
      const m = url.pathname.match(/^\/costume\/([^/]+)$/);
      if (m && request.method === "PUT") {
        const idPath = decodeURIComponent(m[1]);

        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        // Champs attendus (remplacement complet)
        const required = [
          "type", "description", "genre", "mode", "epoque", "couleur",
          "taille", "etat", "emplacement", "emprunteur",
          "date_emprunt", "date_retour", "commentaires",
        ];

        for (const k of required) {
          if (!Object.prototype.hasOwnProperty.call(body, k)) {
            return json({ error: `Missing field: ${k}` }, 400);
          }
        }

        // Validation dates (format "jj/mm/aaaa" ou null / "")
        const dateEmprunt = normalizeDate(body.date_emprunt);
        if (dateEmprunt.error) return json({ error: dateEmprunt.error }, 400);

        const dateRetour = normalizeDate(body.date_retour);
        if (dateRetour.error) return json({ error: dateRetour.error }, 400);

        // UPDATE complet
        // (Je mets des paramètres numérotés ?1 ?2 ... pour éviter de "mal compter" les ?,
        // D1 supporte Ordered (?NNN) et Anonymous (?) :contentReference[oaicite:2]{index=2})
        const sql = `
        UPDATE costume SET
          type = ?1,
          description = ?2,
          genre = ?3,
          mode = ?4,
          epoque = ?5,
          couleur = ?6,
          taille = ?7,
          etat = ?8,
          emplacement = ?9,
          emprunteur = ?10,
          date_emprunt = ?11,
          date_retour = ?12,
          commentaires = ?13
        WHERE id = ?14
      `;

        const r = await env.DB.prepare(sql).bind(
          body.type,
          body.description,
          body.genre,
          body.mode,
          body.epoque,
          body.couleur,
          body.taille,
          body.etat,
          body.emplacement,
          emptyToNull(body.emprunteur),
          dateEmprunt.value,
          dateRetour.value,
          body.commentaires,
          idPath
        ).run(); // run() -> D1Result (success/meta/results) :contentReference[oaicite:3]{index=3}

        if (!r.success) return json({ error: "DB error", details: r }, 500);

        // Si id inexistant => aucune ligne modifiée
        if ((r.meta?.changes ?? 0) === 0) return json({ error: "Not found" }, 404); //: contentReference[oaicite: 4]{ index = 4 }

        // Retourne l'objet mis à jour (first() -> objet ou null, pas de metadata, pense à LIMIT 1) :contentReference[oaicite:5]{index=5}
        const costume = await env.DB.prepare(`
        SELECT id,type,description,genre,mode,epoque,couleur,taille,etat,emplacement,
               emprunteur,date_emprunt,date_retour,commentaires
        FROM costume
        WHERE id = ?
        LIMIT 1
      `).bind(idPath).first();

        return json({ ok: true, costume }, 200);
      }

      // DELETE /costume/{id}
      if (request.method === "DELETE" && url.pathname.startsWith("/costume/")) {
        try {
          const parts = url.pathname.split("/")
          const id = parts[2]

          if (!id) {
            return new Response("Missing ID", { status: 400 })
          }

          await env.DB.prepare(
            "DELETE FROM costume WHERE id = ?"
          ).bind(Number(id)).run()

          return json({ status: "ok", id })
        } catch (err) {
          return json({ error: "DELETE error: ", detail: err.message }, 500)
        }
      }

      return json("Not Found", { status: 404 })
    } catch (err) {
      return json({ error: "DB error", detail: err.message }, 500)
    }
  }
}

function checkAuth(request, env) {
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return { error: "Unauthorized" };
  const token = h.slice("Bearer ".length).trim();
  if (!token || token !== env.API_TOKEN) return { error: "Unauthorized" };
  return null;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function emptyToNull(v) {
  if (v === "" || v === undefined) return null;
  return v;
}

// Accepte: null, "" (-> null), ou "jj/mm/aaaa"
function normalizeDate(v) {
  if (v === null) return { value: null };
  if (typeof v !== "string") return { error: "date_* must be a string or null" };
  const s = v.trim();
  if (s === "") return { value: null };

  // dd/mm/yyyy (simple validation)
  const re = /^(0[1-9]|[12][0-9]|3[01])\/([1-9]|1[0-2])\/(\d{4})$/;
  if (!re.test(s)) return { error: `Invalid date format: "${v}" (expected jj/mm/aaaa)` };

  return { value: s };
}