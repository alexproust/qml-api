export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)

      // CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders
        })
      }

      // GET all costumes
      if (request.method === "GET" && url.pathname === "/costume") {
        const result = await env.DB.prepare(
          "SELECT * FROM costume"
        ).all()

        return new Response(JSON.stringify(result.results), {
          headers: { "Content-Type": "application/json" }
        })
      }

      // GET /costume/{id}
      if (request.method === "GET" && url.pathname.startsWith("/costume/")) {
        try {
          const parts = url.pathname.split("/")
          const id = parts[2]

          if (!id) {
            return new Response("Missing ID", { status: 400 })
          }

          const result = await env.DB
            .prepare("SELECT * FROM costume WHERE id is ? order by rowid desc")
            .bind(Number(id))
            .first()

          if (!result) {
            return new Response("Not found", { status: 404 })
          }

          return new Response(JSON.stringify(result), {
            headers: { "Content-Type": "application/json" }
          })

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

        return new Response(JSON.stringify(result.results), {
          headers: { "Content-Type": "application/json" }
        })
      }

      // POST /costume
      if (request.method === "POST" && url.pathname === "/costume") {
        try {

          const result = await env.DB.prepare(
            'INSERT INTO costume VALUES(NULL,"","","","","","","","","","","","","")'
          ).run()

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

          const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }

          return new Response(JSON.stringify(responseBody), 
          {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            })

        } catch (err) {
          return new Response(
            JSON.stringify({ error: err.message }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" }
            }
          )
        }
      }

      // PUT /costume/{id}
      if (request.method === "PUT" && url.pathname.startsWith("/costume/")) {
        const id = url.pathname.split("/")[2]
        const body = await request.json()

        if (!body.name || !body.value) {
          return new Response("Invalid body", { status: 400 })
        }

        await env.DB.prepare(
          "UPDATE costume SET name = ?, value = ? WHERE rowid = ?"
        ).bind(body.name, body.value, id).run()

        return Response.json({ status: "ok" })
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

          return new Response(
            JSON.stringify({ status: "ok", id }),
            { headers: { "Content-Type": "application/json" } }
          )

        } catch (err) {
          return new Response(
            "DELETE error: " + err.message,
            { status: 500 }
          )
        }
      }

      return new Response("Not Found", { status: 404 })
    } catch (err) {
      return new Response(
        "Worker error: " + err.message,
        { status: 500 }
      )
    }
  }
}
