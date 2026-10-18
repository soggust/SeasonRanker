# Design capture

Keeps the design canvas ("Bets Page Redesign", https://claude.ai/artifact/Rrj2naF4m3QEgq4LdQH1y3) showing the
app as it is on master: the Book and the wallet, captured from a real build at desktop (1440×900) and phone
(390×844) size, each written as a frozen artboard (`.dc.html`) with the page's own CSS and markup.

Nothing here ships. `patch.py` changes two services so a page can run signed in with sample data; it is applied
to a working copy for the build and undone right after. The sample wallet (`fixture.py`) is built from the
model's own ledger (the bot's real picks, made-up stakes): 7 open bets, the last 40 settled, a tally from them.

## Steps (repo root = a checkout of master)

```sh
git fetch origin design-capture
mkdir -p /tmp/sr-tools && for f in patch.py fixture.py capture.py; do git show origin/design-capture:tools/design-capture/$f > /tmp/sr-tools/$f; done
npm ci
python3 /tmp/sr-tools/fixture.py . /tmp/sr-fixture.json
python3 /tmp/sr-tools/patch.py .
npx ng build nfl --configuration development --output-path dist/capture/nfl
git checkout -- libs/ranker/src/engine/account        # the patch undone: the working copy is master again
python3 /tmp/sr-tools/capture.py . /tmp/sr-fixture.json /tmp/sr-boards/project
```

(`pip install playwright --break-system-packages` if it's missing; Chromium is at `/opt/pw-browsers` on the cloud
machines: never `playwright install`.)

`capture.py` prints a JSON summary (each board's size and any page errors) and writes, into the out dir:
`Main.dc.html`, `Phone.dc.html` (the Book), `Wallet.dc.html`, `WalletPhone.dc.html` (the wallet), plus a PNG of
each for checking. Each board carries `<meta name="sr-capture" content="<commit> <time> <path>">`.

ESPN and Firebase are cut off during the capture, so the ticker, live scores and team logos from ESPN's CDN
show as the page shows them offline.

## Putting them on the canvas

Read the canvas first (`canvas.json` and the boards: people edit it), then publish only the four boards and
`canvas.json` with the canvas's `url`, `root` = the out dir laid out as `project/<file>`. In `canvas.json` keep
everything else as it is; make sure each of the four has an entry on `page-1` (`WalletPhone.dc.html`: w 390,
h 844, beside the wallet) and the titles say they are captures. The experiment boards (MainTable, the sport
grounds) are left alone.
