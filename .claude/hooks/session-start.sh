#!/bin/bash
# מכין סשן מרוחק להרצת הבדיקות: playwright בגרסה שתואמת לדפדפן שבתמונה,
# קבצי העזר ששתי סוויטות דורשות, ושרת סטטי על 8777.
# ראו tests/README.md למשתני הסביבה שהסקריפט מייצא.
set -euo pipefail

# מקומית לא נוגעים בכלום — שם הסביבה של המפתח היא הסמכות.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# גרסת playwright שנעולה לבניית ה-Chromium שמותקנת מראש בתמונה המרוחקת.
# אם התמונה תתעדכן, הבדיקה למטה תתריע וההוק ייפול חזרה ל-CHROME.
PW_VERSION="1.56.0"

# ── playwright ─────────────────────────────────────────────────────────────
installed=""
if [ -f node_modules/playwright/package.json ]; then
  installed="$(node -p "require('./node_modules/playwright/package.json').version" 2>/dev/null || true)"
fi

if [ "$installed" != "$PW_VERSION" ]; then
  echo "מתקין playwright@$PW_VERSION"
  npm install --no-audit --no-fund --silent "playwright@$PW_VERSION"
else
  echo "playwright@$PW_VERSION כבר מותקן"
fi

# ── התאמת הדפדפן ───────────────────────────────────────────────────────────
# npx playwright install חסום בתמונה הזאת; במקום זה מאתרים את מה שכבר קיים.
disk_rev="$(ls -d /opt/pw-browsers/chromium-* 2>/dev/null | head -1 | sed 's/.*chromium-//')"
want_rev="$(node -p "require('./node_modules/playwright-core/browsers.json').browsers.find(b=>b.name==='chromium').revision" 2>/dev/null || true)"
chrome_bin="/opt/pw-browsers/chromium-${disk_rev}/chrome-linux/chrome"

if [ -n "$disk_rev" ] && [ "$disk_rev" != "$want_rev" ]; then
  echo "אזהרה: playwright@$PW_VERSION מצפה ל-Chromium $want_rev אך בתמונה יש $disk_rev."
  echo "        הבדיקות ירוצו דרך CHROME=$chrome_bin. עדכנו את PW_VERSION בהוק."
fi

# ── קבצי עזר ───────────────────────────────────────────────────────────────
# e2e צריך shot.png, pwa צריך policy.pdf. שניהם אינם בריפו במכוון
# ואינם צריכים להיות אמיתיים (tests/README.md).
FIX_DIR="$PWD/tests/fixtures"
mkdir -p "$FIX_DIR"

if [ ! -s "$FIX_DIR/shot.png" ]; then
  python3 - "$FIX_DIR/shot.png" <<'PY'
import sys, zlib, struct
def chunk(tag, data):
    body = tag + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
w = h = 64
raw = b''.join(b'\x00' + bytes([80, 120, 200] * w) for _ in range(h))
png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(raw))
       + chunk(b'IEND', b''))
open(sys.argv[1], 'wb').write(png)
PY
  echo "נוצר shot.png"
fi

if [ ! -s "$FIX_DIR/policy.pdf" ]; then
  python3 - "$FIX_DIR/policy.pdf" <<'PY'
import sys
objs = [
    b"<< /Type /Catalog /Pages 2 0 R >>",
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
    b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    b"<< /Length 62 >>\nstream\nBT /F1 24 Tf 72 760 Td (Policy Test Fixture) Tj ET\nendstream",
    b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]
out = bytearray(b"%PDF-1.4\n")
offsets = []
for i, obj in enumerate(objs, 1):
    offsets.append(len(out))
    out += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
xref = len(out)
out += b"xref\n0 %d\n" % (len(objs) + 1) + b"0000000000 65535 f \n"
for off in offsets:
    out += b"%010d 00000 n \n" % off
out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
open(sys.argv[1], 'wb').write(bytes(out))
PY
  echo "נוצר policy.pdf"
fi

# ── שרת סטטי ───────────────────────────────────────────────────────────────
# IndexedDB לא עובד מעל file://, ולכן כל סוויטה דורשת שרת.
if curl -sf -o /dev/null "http://127.0.0.1:8777/index.html" 2>/dev/null; then
  echo "שרת 8777 כבר רץ"
else
  nohup python3 -m http.server 8777 >/tmp/family-vault-http.log 2>&1 &
  disown || true
  echo "הופעל שרת סטטי על 8777"
fi

# ── משתני סביבה לסשן ───────────────────────────────────────────────────────
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo "export ROOT=\"$PWD\""
    echo "export FIXTURES=\"$FIX_DIR\""
    [ -x "$chrome_bin" ] && echo "export CHROME=\"$chrome_bin\""
  } >> "$CLAUDE_ENV_FILE"
fi

echo "מוכן. הרצה: node tests/units.mjs"
