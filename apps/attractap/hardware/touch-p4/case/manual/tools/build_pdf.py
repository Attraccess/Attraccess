"""Builds the installation manual's PDFs, docs/_media/hardware/touch-p4/attractap-installation-manual-<lang>.pdf, from its
pages in the documentation, docs/<lang>/hardware/touch-p4/installation-manual.md, in English and German (paths from the
repository root).

    python3 -I build_pdf.py [path to a Chromium-based browser]

Turns the Markdown into HTML and prints it to A4 with a headless Chromium-based browser. The converter covers only what
the manual uses: headings, paragraphs, tables, numbered lists, bullet and check lists, bold, code, links and figures.
"""
import html, os, re, shutil, subprocess, sys, tempfile

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), *[".."] * 7))
LANGUAGES = ("en", "de")
PAGE = os.path.join(REPO, "docs", "{lang}", "hardware", "touch-p4", "installation-manual.md")
OUT = os.path.join(REPO, "docs", "_media", "hardware", "touch-p4", "attractap-installation-manual-{lang}.pdf")
BROWSERS = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "chromium", "chromium-browser", "google-chrome"]

CSS = """
@page { size: A4; margin: 18mm 17mm 20mm; @bottom-right { content: counter(page) " / " counter(pages); font: 8pt "Helvetica Neue", Helvetica, Arial, sans-serif; color: #5E6A72; } }
body { font: 10.5pt/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #202729; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 14pt; }
h2 { font-size: 15pt; margin: 22pt 0 6pt; padding-top: 8pt; border-top: 1px solid #D5DADF; break-after: avoid; }
h3 { font-size: 12pt; margin: 16pt 0 4pt; break-after: avoid; }
p { margin: 0 0 8pt; }
ol, ul { margin: 0 0 8pt; padding-left: 18pt; }
li { margin-bottom: 3pt; }
ul.check { list-style: none; padding-left: 0; }
ul.check li { padding-left: 18pt; text-indent: -18pt; }
ul.check li::before { content: "\\2610"; display: inline-block; width: 18pt; text-indent: 0; }
code { font: 9pt Menlo, Consolas, monospace; background: #EEF1F4; padding: 0 2pt; border-radius: 2pt; }
a { color: #256D7B; text-decoration: none; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; font-size: 9.5pt; }
th, td { border: 1px solid #D5DADF; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #EAF3F4; }
tr { break-inside: avoid; }
figure { margin: 8pt 0 4pt; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 105mm; border: 1px solid #D5DADF; }
figure + p { color: #5E6A72; font-size: 9.5pt; break-before: avoid; }
"""


SITE = "https://docs.attraccess.org/#/{lang}/"


def href(target, lang):
    """A page of the documentation (written from the language root, as the docs site wants it) becomes its address on
    the docs site; web links stay as they are."""
    page, _, anchor = target.partition("#")
    if re.match(r"^[a-z]+:", target) or not page.endswith(".md"):
        return target
    return SITE.format(lang=lang) + page[:-3] + (f"?id={anchor}" if anchor else "")


def inline(text, lang):
    t = html.escape(text, quote=False)
    t = re.sub(r"(\]\()([^)\s]+)\)", lambda m: m.group(1) + href(m.group(2), lang) + ")", t)
    t = re.sub(r"\[`([^`]+)`\]\(([^)]+)\)", r'<a href="\2"><code>\1</code></a>', t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def block(lines, lang):
    first = lines[0]
    m = re.match(r"(#{1,3}) (.*)", first)
    if m:
        return f"<h{len(m.group(1))}>{inline(m.group(2), lang)}</h{len(m.group(1))}>"
    m = re.match(r"!\[(.*)\]\((.+)\)$", first)
    if m:
        return f'<figure><img src="{html.escape(m.group(2))}" alt="{html.escape(m.group(1))}"></figure>'
    if first.startswith("|"):
        head, body = cells(first), [cells(l) for l in lines[2:]]
        rows = "".join("<tr>" + "".join(f"<td>{inline(c, lang)}</td>" for c in r) + "</tr>" for r in body)
        return "<table><tr>" + "".join(f"<th>{inline(c, lang)}</th>" for c in head) + "</tr>" + rows + "</table>"
    if re.match(r"\d+\. ", first):
        return "<ol>" + "".join(f"<li>{inline(re.sub(r'^\d+\. ', '', l), lang)}</li>" for l in lines) + "</ol>"
    if first.startswith("- [ ] "):
        return '<ul class="check">' + "".join(f"<li>{inline(l[6:], lang)}</li>" for l in lines) + "</ul>"
    if first.startswith("- "):
        return "<ul>" + "".join(f"<li>{inline(l[2:], lang)}</li>" for l in lines) + "</ul>"
    return f"<p>{inline(' '.join(lines), lang)}</p>"


def to_html(markdown, lang):
    blocks = [b.splitlines() for b in re.split(r"\n\s*\n", markdown.strip())]
    title = html.escape(blocks[0][0].lstrip("# "))
    return (f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head><body>'
            + "\n".join(block(b, lang) for b in blocks) + "</body></html>")


def browser():
    for b in sys.argv[1:2] + BROWSERS:
        found = b if os.path.isfile(b) else shutil.which(b)
        if found:
            return found
    sys.exit("no Chromium-based browser found; pass its path as the first argument")


if __name__ == "__main__":
    for lang in LANGUAGES:
        source, out = PAGE.format(lang=lang), OUT.format(lang=lang)
        page = os.path.join(os.path.dirname(source), ".manual-print.html")   # next to the page: its image links resolve
        open(page, "w").write(to_html(open(source).read(), lang))
        try:
            with tempfile.TemporaryDirectory() as profile:
                subprocess.run([browser(), "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                                f"--user-data-dir={profile}", f"--print-to-pdf={out}", "file://" + page],
                               check=True, capture_output=True, timeout=180)
        finally:
            os.remove(page)
        print("ok", out)
    # record the sources these files were made from (scripts/check-generated.mjs, run before each commit)
    subprocess.run(["node", os.path.join(REPO, "scripts", "check-generated.mjs"), "--stamp", "manual-pdf"], check=True)
