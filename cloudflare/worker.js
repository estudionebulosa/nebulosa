/**
 * Cloudflare Worker in front of GitHub Pages.
 *
 * GitHub Pages is the origin (DNS A/AAAA → GitHub). This worker:
 *   - 301s the rules in /_redirects (GitHub Pages ignores that file)
 *   - serves POST /api/contact (static hosts cannot)
 *   - adds security headers the origin cannot set
 *   - then fetch(request) so the rest of the site comes from GitHub Pages
 *
 * fetch() from a Worker goes to the DNS origin. It does not re-enter this worker.
 */

/* Keep in sync with /_redirects — CI compares the two. */
const REDIRECTS = `
/blog/*  /news/:splat  301
/blog  /news/  301
/news/como-escribir-html-para-la-ia.html  /news/documento-pagina-web-para-ias-y-humanos.html  301
/news/documento-optimizacion-paginas-web-para-motores-de-busqueda-e-inteligencias-artificiales-seo-geo.html  /news/documento-pagina-web-para-ias-y-humanos.html  301
`;

const BUDGETS = new Set(["", "<10k", "10-30k", "30-80k", ">80k"]);

function matchRedirect(pathname) {
  for (const line of REDIRECTS.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const [from, to, status] = l.split(/\s+/);
    if (!from || !to) continue;
    const code = Number(status) || 301;
    if (from.endsWith("/*")) {
      const prefix = from.slice(0, -1);
      if (pathname.startsWith(prefix)) {
        return { to: to.replace(":splat", pathname.slice(prefix.length)), status: code };
      }
    } else if (pathname === from || (from.endsWith("/") === false && pathname === from + "/")) {
      return { to, status: code };
    }
  }
  return null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function oneLine(s) {
  return String(s || "").replace(/[\r\n]+/g, " ").trim();
}

function page(status, title, body) {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — Nebulosa Estudio</title>
<style>
  :root{color-scheme:light dark;--bg:#0a0a14;--fg:#e8e8f0;--accent:#8b5cf6}
  @media(prefers-color-scheme:light){:root{--bg:#fafafc;--fg:#0a0a14}}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:2rem;
    background:var(--bg);color:var(--fg);font:1.05rem/1.5 system-ui,sans-serif;text-align:center}
  .box{max-width:36rem} h1{font-size:1.6rem;letter-spacing:-.02em}
  a{color:var(--accent)}
</style>
</head>
<body><div class="box"><h1>${escapeHtml(title)}</h1>${body}<p><a href="/">← Inicio / Home</a></p></div></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

function sameSite(request) {
  const host = new URL(request.url).host;
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).host === host; } catch { return false; }
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try { return new URL(referer).host === host; } catch { return false; }
  }
  return false;
}

async function handleContact(request, env) {
  if (request.method !== "POST") {
    return page(405, "Método no permitido", "<p>Use the form on the homepage.</p>");
  }
  if (!sameSite(request)) {
    return page(403, "Solicitud rechazada", "<p>The form must be submitted from this site.</p>");
  }
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 32_000) {
    return page(413, "Mensaje demasiado largo", "<p>Please shorten the message.</p>");
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return page(400, "Formulario inválido", "<p>Could not read the form.</p>");
  }

  /* honeypot — pretend success so bots don't retry */
  if (String(form.get("website") || "").trim()) {
    return page(200, "Mensaje recibido", "<p>Thanks. We'll be in touch.</p>");
  }

  const name = oneLine(form.get("name")).slice(0, 80);
  const email = oneLine(form.get("email")).slice(0, 120);
  const company = oneLine(form.get("company")).slice(0, 80);
  const budget = oneLine(form.get("budget"));
  const message = String(form.get("message") || "").trim().slice(0, 2000);

  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 20) {
    return page(400, "Revisa el formulario",
      "<p>Name, a valid email, and a message of at least 20 characters are required.</p>");
  }
  if (!BUDGETS.has(budget)) {
    return page(400, "Revisa el formulario", "<p>Unknown budget option.</p>");
  }

  const text = [
    `Nombre: ${name}`,
    `Email: ${email}`,
    company ? `Empresa: ${company}` : "",
    budget ? `Presupuesto: ${budget}` : "",
    "",
    message,
  ].filter(Boolean).join("\n");

  const to = env.CONTACT_TO || "hola@nebulosa.estudio";

  try {
    if (env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.CONTACT_FROM || "Nebulosa Estudio <hola@nebulosa.estudio>",
          to: [to],
          reply_to: email,
          subject: `Contacto web: ${name}`,
          text,
        }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}`);
    } else if (env.CONTACT_WEBHOOK) {
      const res = await fetch(env.CONTACT_WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, company, budget, message, source: "nebulosa.estudio" }),
      });
      if (!res.ok) throw new Error(`webhook ${res.status}`);
    } else {
      const mail = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent("Contacto web: " + name)}&body=${encodeURIComponent(text)}`;
      return page(200, "Escríbenos por email",
        `<p>El formulario todavía no tiene un buzón conectado. Puedes enviarnos el mismo mensaje por email.</p>
         <p><a href="${mail}">${escapeHtml(to)}</a></p>`);
    }
  } catch {
    const mail = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent("Contacto web: " + name)}&body=${encodeURIComponent(text)}`;
    return page(502, "No se pudo enviar",
      `<p>Something went wrong delivering the form. Email us directly:</p>
       <p><a href="${mail}">${escapeHtml(to)}</a></p>`);
  }

  return page(200, "Mensaje recibido",
    "<p>Gracias. Respondemos en menos de 24 horas hábiles.</p><p>Thanks — we reply within one business day.</p>");
}

function securityHeaders(headers) {
  headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  headers.set("cross-origin-opener-policy", "same-origin");
  /* Inline theme/lang boot + inlined CSS are first-party. No third parties. */
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ")
  );
}

function cacheHeaders(headers, pathname, contentType) {
  if (pathname.startsWith("/assets/")) {
    headers.set("cache-control", "public, max-age=86400");
    return;
  }
  const html = contentType.includes("text/html") || pathname.endsWith("/") || pathname.endsWith(".html");
  if (html) {
    headers.set("cache-control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === "www.nebulosa.estudio") {
      url.hostname = "nebulosa.estudio";
      return Response.redirect(url.toString(), 301);
    }

    const redir = matchRedirect(url.pathname);
    if (redir && (request.method === "GET" || request.method === "HEAD")) {
      const dest = new URL(redir.to, url.origin);
      dest.search = url.search;
      return Response.redirect(dest.toString(), redir.status);
    }

    if (url.pathname === "/api/contact") {
      const res = await handleContact(request, env);
      securityHeaders(res.headers);
      return res;
    }

    const origin = await fetch(request);
    const headers = new Headers(origin.headers);
    const type = headers.get("content-type") || "";
    if (url.pathname.endsWith(".webmanifest")) {
      headers.set("content-type", "application/manifest+json; charset=utf-8");
    }
    securityHeaders(headers);
    cacheHeaders(headers, url.pathname, type);
    return new Response(origin.body, { status: origin.status, headers });
  },
};
