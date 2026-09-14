# Browser demo

The [GitHub Pages demo](https://sebastianspicker.github.io/cueq/) lets visitors
try time recording, booking corrections, and approvals without an account. It
uses the application's CSS and invented records. The HTML and JavaScript run
entirely in the browser; the demo has no API or database connection.

This demo is in German. The full Next.js application also has English
translations in `apps/web/src/messages/`.

## Run it locally

From the repository root, with Node.js 22.13 or later:

```bash
node scripts/build-pages-demo.mjs
node scripts/verify-pages-demo.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:4173/pages-demo/>. No package installation is needed.
Python 3 serves the preview; stop it with `Ctrl-C`.

## What to try

1. Open `Heute` and select `Gehen buchen` to record a clock-out. Select
   `Buchung zurücksetzen` to restore the original entry.
2. Open `Buchungen` and select `Korrigieren` or `Buchung ergänzen`. The journal
   shows a correction request.
3. Open `Genehmigungen`, select a request, and approve or reject it. The open
   count decreases and the decision stays visible.
4. Use `Gehe zu …` or `Ctrl/Cmd+K` to find a view. Change the color theme in the
   top bar. On a small screen, open the menu to switch views or reset the demo.

The date and clock are fixed examples. Changes last until you reload or select
`Demo zurücksetzen`. Only the color theme is saved in local storage. No real
bookings, decisions, or notifications are sent.

## How it is built

The build script writes `dist/pages-demo/` with the demo's HTML, JavaScript,
CSS, application stylesheets, and icon. It does not export the Next.js app.

The verification script checks required files, relative asset links, stylesheet
imports, and the presence of interactive controls. It rejects raster images
and known network-request APIs in the demo script. These checks cannot tell
whether controls work or the layout is readable; check those in the browser.

## Publish to GitHub Pages

The [Pages workflow](../../.github/workflows/pages.yml) builds and checks
relevant pull requests. On `main`, or when run manually, it also uploads and
deploys `dist/pages-demo/`. Select `GitHub Actions` as the repository's Pages
source. Only the deploy job receives deployment permissions.

After deployment, open the hosted page and try the steps above. Check asset
loading and direct links such as `#genehmigungen`, which must also work under
the repository's `/cueq/` URL.

## After a visual change

Rebuild and review all three views at desktop and mobile widths. Check both
themes, keyboard navigation, a command search with no results, and the browser
console. Every visible name and record should come from the invented fixtures
in `demo.js` or `index.html`.

Update the [README screenshots](../assets/screenshots/README.md) from clean
initial states without transient notifications. The screenshots belong in the
README; the Pages build serves the interactive interface.
