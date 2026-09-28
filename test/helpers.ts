import http from "node:http";
import type { AddressInfo } from "node:net";

export async function serve(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

const layout = (title: string, body: string) => `<!doctype html><html><head><title>${title} | Sunny Paws Grooming</title>
<meta name="description" content="Dog and cat grooming in Austin, TX."><meta property="og:site_name" content="Sunny Paws Grooming"><meta name="theme-color" content="#0ea5e9">
<script>var tracking = "ignore me";</script><style>.x{}</style></head><body>
<nav><a href="/">Home</a> <a href="/services">Services</a> <a href="/contact">Contact</a> <a href="/about">About</a></nav>
<main>${body}</main>
<footer><p>Sunny Paws Grooming, 12 Oak St, Austin TX</p><p>Call <a href="tel:+15125550100">us</a></p></footer></body></html>`;

export const SITE: Record<string, string> = {
  "/": layout("Home", "<h1>Happy pets, happy people</h1><p>We groom dogs and cats of all sizes.</p>"),
  "/services": layout("Services", "<h1>Services & pricing</h1><ul><li>Full groom (small dog): $65</li><li>Full groom (large dog): $95</li><li>Nail trim: $15</li><li>Cat bath: $70</li></ul>"),
  "/contact": layout("Contact", "<h1>Contact</h1><p>Opening hours: Tuesday to Saturday, 9am to 6pm. Closed Sunday and Monday.</p><p>Cancellations need 24 hours notice or a $20 fee applies.</p>"),
  "/about": layout("About", "<h1>About us</h1><p>Family owned since 2015. Our groomers are certified.</p><a href='/secret.pdf'>PDF</a><a href='https://other.example.com/x'>ext</a>"),
};

export function siteHandler(): http.RequestListener {
  return (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/sitemap.xml") {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(`<urlset><url><loc>http://${req.headers.host}/about</loc></url></urlset>`);
      return;
    }
    const page = SITE[path];
    if (!page) {
      res.writeHead(404).end("nope");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
  };
}
