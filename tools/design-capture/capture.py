# Captures the real app's pages as Design-canvas artboards (.dc.html), for the "Bets Page Redesign" canvas.
#
# Usage (from the repo root, after `npm ci`, `python3 tools/design-capture/patch.py .` and
# `npx ng build nfl --configuration development --output-path dist/capture/nfl`):
#   python3 tools/design-capture/capture.py <repo root> <fixture.json> <out dir>
#
# Serves the build the way dev.mjs does (shared pages like /book and /wallet on the first sport's app, each
# sport's /<sport>/data/ from apps/<sport>/src/StaticData), opens each page in Chromium signed in as the
# fixture's sample player (window.__SR_FIXTURE, read by the capture-only patch), and writes one
# self-contained artboard per page: the page's own CSS and markup, frozen, every local image and font
# inlined as a data: URI. External hosts (ESPN, Firebase) are cut off, so the ticker and live scores show
# whatever the page shows with no network. Prints a JSON summary of what it wrote.
import base64, functools, http.server, json, mimetypes, os, re, socketserver, sys, threading, time

from playwright.sync_api import sync_playwright

ROOT, FIXTURE, OUT = (os.path.abspath(a) for a in sys.argv[1:4])
SPORTS = [s['id'] for s in json.load(open(os.path.join(ROOT, 'sports.json')))]
SHARED = ['book', 'settings', 'lists', 'community', 'tracker', 'wallet', 'friends', 'privacy', 'data-deletion', 'u']
BUILD = os.path.join(ROOT, 'dist/capture')
PORT = 4377

# (artboard file, page path, viewport width, height, title)
PAGES = [
    ('Main.dc.html', '/book/', 1440, 900, 'The Book — desktop'),
    ('Phone.dc.html', '/book/', 390, 844, 'The Book — phone'),
    ('Wallet.dc.html', '/wallet/', 1440, 900, 'Wallet — desktop'),
    ('WalletPhone.dc.html', '/wallet/', 390, 844, 'Wallet — phone'),
]


def app_dir(sport):
    d = os.path.join(BUILD, sport)
    return os.path.join(d, 'browser') if os.path.isdir(os.path.join(d, 'browser')) else d


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        parts = path.split('/')
        if len(parts) > 1 and parts[1] in SHARED:
            parts = ['', SPORTS[0], '']
        sport, rest = (parts[1] if len(parts) > 1 else ''), parts[2:]
        if sport not in SPORTS:
            return self.send_error(404)
        if rest and rest[0] == 'data':
            base, rel = os.path.join(ROOT, 'apps', sport, 'src/StaticData'), rest[1:]
        else:
            base, rel = app_dir(SPORTS[0] if not os.path.isdir(app_dir(sport)) else sport), rest
        f = os.path.normpath(os.path.join(base, *[p for p in rel if p]))
        if not f.startswith(base) or not os.path.isfile(f):
            if rest and rest[0] == 'data':
                return self.send_error(404)
            f = os.path.join(app_dir(sport if os.path.isdir(app_dir(sport)) else SPORTS[0]), 'index.html')
        body = open(f, 'rb').read()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(f)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


# In the page: the CSS of every stylesheet (urls made absolute), the markup with scripts dropped, form values
# and canvases frozen, and html/body attributes, which the artboard sets again when it mounts.
SNAPSHOT = r"""
() => {
  const abs = (u, base) => { try { return new URL(u, base).href; } catch { return u; } };
  const fix = (css, base) => css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => u.startsWith('data:') ? m : `url("${abs(u, base)}")`);
  let css = '';
  for (const sheet of document.styleSheets) {
    const base = sheet.href || document.baseURI;
    try { for (const r of sheet.cssRules) css += fix(r.cssText, base) + '\n'; } catch (e) {}
  }
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script, noscript, router-outlet').forEach((n) => n.remove());
  const live = document.body.querySelectorAll('input, textarea, select, canvas');
  const copies = clone.querySelectorAll('input, textarea, select, canvas');
  live.forEach((el, i) => {
    const c = copies[i];
    if (!c) return;
    if (el.tagName === 'CANVAS') { const img = document.createElement('img'); try { img.src = el.toDataURL(); } catch (e) {} img.style.cssText = getComputedStyle(el).cssText; img.width = el.width; img.height = el.height; c.replaceWith(img); }
    else if (el.tagName === 'TEXTAREA') c.textContent = el.value;
    else if (el.tagName === 'SELECT') { [...c.options].forEach((o, j) => { if (el.options[j]?.selected) o.setAttribute('selected', ''); }); }
    else if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) c.setAttribute('checked', ''); }
    else c.setAttribute('value', el.value);
  });
  clone.querySelectorAll('[src]').forEach((n) => n.setAttribute('src', abs(n.getAttribute('src'), document.baseURI)));
  clone.querySelectorAll('[srcset]').forEach((n) => n.removeAttribute('srcset'));
  clone.querySelectorAll('a[href]').forEach((n) => n.setAttribute('href', '#'));
  clone.querySelectorAll('[style]').forEach((n) => n.setAttribute('style', fix(n.getAttribute('style'), document.baseURI)));
  const attrs = (el) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
  return { css, html: clone.innerHTML, htmlAttrs: attrs(document.documentElement), bodyAttrs: attrs(document.body), title: document.title };
}
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    fixture = open(FIXTURE).read()
    httpd = serve()
    origin = f'http://127.0.0.1:{PORT}'
    commit = os.popen(f'git -C {ROOT} rev-parse --short HEAD').read().strip()
    summary = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, path, w, h, title in PAGES:
            ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=w < 600, has_touch=w < 600)
            ctx.add_init_script(f'window.__SR_FIXTURE = {fixture};')
            cache = {}

            def route(r):
                u = r.request.url
                if u.startswith(origin) or 'fonts.googleapis.com' in u or 'fonts.gstatic.com' in u:
                    return r.continue_()
                return r.abort()

            ctx.route('**/*', route)
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)[:200]))
            page.goto(origin + path, wait_until='networkidle', timeout=90000)
            # (the app booted: its loading panel gone; then a moment for the data to land)
            try:
                page.wait_for_function("() => document.querySelector('app-root') && !document.querySelector('.app-loading')", timeout=60000)
            except Exception:
                errors.append('the app never finished loading (its loading panel is still up)')
            page.wait_for_timeout(4000)
            # (no motion in the frozen copy: every animation at its end)
            page.add_style_tag(content='*,*::before,*::after{animation-play-state:paused!important;transition:none!important}')
            snap = page.evaluate(SNAPSHOT)
            page.screenshot(path=os.path.join(OUT, name.replace('.dc.html', '.png')), full_page=False)

            # Every same-origin url() and src, inlined (each file once)
            def data_uri(u):
                if not u.startswith(origin):
                    return u
                if u not in cache:
                    resp = page.request.get(u)
                    mime = (resp.headers.get('content-type') or mimetypes.guess_type(u)[0] or 'application/octet-stream').split(';')[0]
                    cache[u] = f'data:{mime};base64,' + base64.b64encode(resp.body()).decode() if resp.ok else u
                return cache[u]

            url_re = re.compile(r'url\(\s*(["\']?)([^"\')]+)\1\s*\)')
            css = url_re.sub(lambda m: f'url("{data_uri(m.group(2))}")', snap['css'])
            html = url_re.sub(lambda m: f'url(&quot;{data_uri(m.group(2).replace("&quot;", ""))}&quot;)', snap['html'])
            html = re.sub(r'(\ssrc=")([^"]+)(")', lambda m: m.group(1) + data_uri(m.group(2).replace('&amp;', '&')) + m.group(3), html)
            # (the canvas's template holes are {{ }}: none may come from the page)
            html = html.replace('{{', '{ {').replace('}}', '} }')
            css = css.replace('</style', '<\\/style')
            ha, ba = json.dumps(snap['htmlAttrs']), json.dumps(snap['bodyAttrs'])
            props = json.dumps({'$preview': {'width': w, 'height': h}}).replace("'", '&#39;')
            doc = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<meta name="sr-capture" content="{commit} {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {path}">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
{css}
</style>
</helmet>
<div data-sr-capture style="min-height:100%">
{html}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{props}'>
class Component extends DCLogic {{
  componentDidMount() {{
    // (the captured page's own html and body attributes: its classes and theme)
    const set = (el, a) => Object.entries(a).forEach(([k, v]) => {{ if (k !== 'style') el.setAttribute(k, v); }});
    set(document.documentElement, {ha});
    set(document.body, {ba});
  }}
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''
            open(os.path.join(OUT, name), 'w').write(doc)
            summary.append({'file': name, 'path': path, 'size': len(doc), 'errors': errors[:5], 'w': w, 'h': h, 'title': title})
            ctx.close()
        browser.close()
    httpd.shutdown()
    print(json.dumps({'commit': commit, 'boards': summary}, indent=1))


if __name__ == '__main__':
    main()
