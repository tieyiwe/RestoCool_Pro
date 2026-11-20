import re, subprocess, sys, base64, html, pathlib
REPO = pathlib.Path("/home/user/restocool_pro")
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
icon = base64.b64encode((REPO/"public/brand/png/app-icon-192.png").read_bytes()).decode()
css = (pathlib.Path(__file__).parent / "doc.css").read_text()
L = {
 "en": dict(src="03-sop-onboarding-a-business.md", eyebrow="Standard operating procedure · No. 3",
   title="Onboarding a business", sub="From « interested » to « customers scan and order », in one visit of about 45 minutes, with the owner holding their own account.",
   meta=[("Document","SOP 3 · Onboarding"),("For","Sales agents, support, owners"),("Version","November 2026"),("Language","English")],
   keys={"Goal":"Goal","Who":"Who","Golden rule":"Golden rule"}, foot="RestoCool · a TIBLOGICS product · restocool.com", lang="en"),
 "fr": dict(src="03-sop-onboarding-a-business.fr.md", eyebrow="Procédure opérationnelle · N° 3",
   title="Mettre en service un établissement", sub="De « intéressé » à « les clients scannent et commandent », en une visite d’environ 45 minutes, avec le propriétaire maître de son propre compte.",
   meta=[("Document","Procédure 3 · Mise en service"),("Pour","Agents commerciaux, support, propriétaires"),("Version","Novembre 2026"),("Langue","Français")],
   keys={"Objectif":"Objectif","Qui":"Qui","Règle d’or":"Règle d’or"}, foot="RestoCool · un produit TIBLOGICS · restocool.com", lang="fr"),
}
def pandoc(md, fmt="html"):
    return subprocess.run(["pandoc","-f","gfm","-t",fmt,"--wrap=none"], input=md, capture_output=True, text=True, check=True).stdout
for code, c in L.items():
    md = (REPO/"docs/platform"/c["src"]).read_text()
    body = md.split("\n---\n",1)
    head, rest = body[0], body[1]
    cards = []
    for k in c["keys"]:
        m = re.search(r"\*\*"+re.escape(k)+r"\s?:\*\*\s*(.+)", head)
        t0 = m.group(1).strip(); txt = pandoc(t0[:1].upper() + t0[1:]).strip()
        cls = "card rule" if k in ("Golden rule","Règle d’or") else "card"
        cards.append(f'<div class="{cls}"><div class="k">{k}</div>{txt}</div>')
    h = pandoc(rest)
    h = re.sub(r"<h2([^>]*)>([A-Z])\. ", lambda m: f'<h2{m.group(1)}><span class="letter">{m.group(2)}</span>', h)
    # Prepared-business sub-sections in a soft box.
    h = re.sub(r"(<h3[^>]*>.*?)(?=<h3|<h2)", lambda m: f'<div class="prepared">{m.group(1)}</div>', h, flags=re.S)
    meta = "".join(f"<div>{a}<b>{b}</b></div>" for a,b in c["meta"])
    page = f'''<!doctype html><html lang="{c["lang"]}"><head><meta charset="utf-8"><style>{css}</style></head><body>
<section class="cover"><div class="brand"><img src="data:image/png;base64,{icon}" alt=""><span>Resto<b>Cool</b></span></div>
<div class="eyebrow">{c["eyebrow"]}</div><h1>{c["title"]}</h1><div class="bar"></div><div class="sub">{c["sub"]}</div>
<div class="meta">{meta}</div></section>
<section class="content"><div class="intro">{"".join(cards)}</div>{h}
<div class="end"><span>{c["foot"]}</span><span>{c["meta"][2][1]}</span></div></section></body></html>'''
    name = "03-sop-onboarding-a-business" + ("" if code=="en" else ".fr")
    (OUT/f"{name}.html").write_text(page)
    print("html", name)
