import { NextResponse, type NextRequest } from "next/server";

/**
 * When SITE_PASSWORD is set (test deployments), the whole site sits behind a password page.
 * Test sites show sign-in codes on screen, so without this anyone could sign in as any number.
 *
 * It is a page rather than the browser's own password popup because in-app browsers (WhatsApp,
 * Instagram, Facebook) never show that popup, so testers opening a shared link saw only an error.
 * A link ending in ?key=<password> lets testers straight in without typing anything.
 */
const COOKIE = "gm-site";
const ENTER_PATH = "/__enter";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname, searchParams } = request.nextUrl;
  // Safaricom and Paystack cannot type the password; these routes check their own secrets.
  if (pathname.startsWith("/api/payments/")) return NextResponse.next();

  const token = await siteToken(password);

  if (pathname === ENTER_PATH && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const next = safeNext(String(form?.get("next") ?? "/"));
    if (form?.get("password") !== password) return passwordPage(next, true);
    return enter(new URL(next, request.url), token);
  }

  // A shared link carrying the password: let them in and drop the key from the address bar.
  if (searchParams.get("key") === password) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("key");
    return enter(clean, token);
  }

  if (request.cookies.get(COOKIE)?.value === token || basicAuthOk(request, password)) return NextResponse.next();

  if (request.method === "GET" && !pathname.startsWith("/api/")) {
    return passwordPage(safeNext(pathname + request.nextUrl.search), false);
  }
  return new NextResponse("Password required", { status: 401 });
}

function enter(to: URL, token: string) {
  const res = NextResponse.redirect(to, 303);
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
  return res;
}

/** The cookie holds a hash, so the password itself is never stored in the browser. */
async function siteToken(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`g-money-site:${password}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Testers who saved the old link with the password in the browser prompt still get in. */
function basicAuthOk(request: NextRequest, password: string) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1) === password;
  } catch {
    return false;
  }
}

/** Only ever send people back to a page on this site. */
function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith(ENTER_PATH) ? next : "/";
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function passwordPage(next: string, wrong: boolean) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>G-Money test site</title>
<meta name="theme-color" content="#0b1020"><link rel="icon" href="/icon.svg">
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(40rem 24rem at 80% 0%,#7c3aed40,transparent 60%),radial-gradient(30rem 20rem at 0% 100%,#22d3a61f,transparent 60%),#070a15;color:#fff;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px;box-sizing:border-box}
  form{width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px;background:linear-gradient(180deg,#151b36,#0b1020);border:1px solid #2a3256;border-radius:20px;padding:24px;box-shadow:0 24px 60px -30px #7c3aedcc}
  img{width:150px;height:60px;margin:0 auto 4px}
  p{margin:0;color:#ffffffb3;font-size:14px;line-height:1.4;text-align:center}
  input{font-size:16px;padding:12px;border-radius:12px;border:1px solid #2a3256;background:#070a15;color:#fff}
  input:focus{outline:none;border-color:#a78bfa;box-shadow:0 0 0 3px #7c3aed4d}
  button{font-size:16px;font-weight:800;padding:12px;border:0;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#7c3aed 55%,#5b21b6);color:#fff;box-shadow:0 8px 24px -10px #7c3aed;cursor:pointer;transition:transform .15s}
  button:active{transform:scale(.97)}
  .err{color:#f87171}
</style></head>
<body><form method="post" action="${ENTER_PATH}">
  <img src="/brand/logo-on-dark.svg" alt="G-Money">
  <p>This is a test site. Enter the password you were given.</p>
  <input type="hidden" name="next" value="${escapeHtml(next)}">
  <input name="password" type="password" autocomplete="current-password" placeholder="Password" required autofocus>
  <button>Enter</button>
  ${wrong ? '<p class="err">That password is not right. Try again.</p>' : ""}
</form></body></html>`;
  // 200 rather than 401: some in-app browsers show their own error page for a 401.
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|brand/).*)"],
};
