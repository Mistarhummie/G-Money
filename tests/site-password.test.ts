import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const BASE = "https://test.example";
const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(BASE + path, init);

describe("test-site password", () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = "secret123";
  });
  afterEach(() => {
    delete process.env.SITE_PASSWORD;
  });

  it("shows a password page (not the browser popup, which in-app browsers never show)", async () => {
    const res = await proxy(req("/shop?x=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
    const html = await res.text();
    expect(html).toContain('name="password"');
    expect(html).toContain('value="/shop?x=1"');
  });

  it("lets people in after the right password and remembers them", async () => {
    const wrong = await proxy(req("/__enter", { method: "POST", body: new URLSearchParams({ password: "nope", next: "/shop" }) }));
    expect(await wrong.text()).toContain("not right");

    const ok = await proxy(req("/__enter", { method: "POST", body: new URLSearchParams({ password: "secret123", next: "/shop" }) }));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe(`${BASE}/shop`);
    const cookie = ok.cookies.get("gm-site")!.value;
    expect(cookie).not.toContain("secret123");

    const next = await proxy(req("/play", { headers: { cookie: `gm-site=${cookie}` } }));
    expect(next.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a ?key= link straight in and removes the key from the address", async () => {
    const res = await proxy(req("/play?key=secret123&g=1"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${BASE}/play?g=1`);
    expect(res.cookies.get("gm-site")).toBeTruthy();
  });

  it("never redirects off the site after entering", async () => {
    const res = await proxy(req("/__enter", { method: "POST", body: new URLSearchParams({ password: "secret123", next: "//evil.example" }) }));
    expect(res.headers.get("location")).toBe(`${BASE}/`);
  });

  it("still accepts the old browser password and blocks API calls without it", async () => {
    const basic = await proxy(req("/", { headers: { authorization: `Basic ${btoa("any:secret123")}` } }));
    expect(basic.headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(req("/api/challenges/1"))).status).toBe(401);
    expect((await proxy(req("/api/payments/intasend", { method: "POST" }))).headers.get("x-middleware-next")).toBe("1");
  });
});
