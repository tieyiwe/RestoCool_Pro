import subprocess, re, pathlib
from docx import Document
from docx.shared import RGBColor, Pt
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
REPO = pathlib.Path("/home/user/restocool_pro")
subprocess.run(["pandoc", "-o", "ref.docx", "--print-default-data-file", "reference.docx"], check=True)
d = Document("ref.docx")
def style(name, color=None, size=None, bold=None, font="Calibri"):
    s = next(x for x in d.styles if x.name == name); f = s.font
    f.name = font
    rpr = s.element.get_or_add_rPr(); rf = rpr.find(qn("w:rFonts"))
    if rf is None: rf = OxmlElement("w:rFonts"); rpr.append(rf)
    for a in ("w:ascii","w:hAnsi","w:cs","w:eastAsia"): rf.set(qn(a), font)
    for a in ("w:asciiTheme","w:hAnsiTheme","w:cstheme","w:eastAsiaTheme"):
        if rf.get(qn(a)) is not None: del rf.attrib[qn(a)]
    if color: f.color.rgb = RGBColor.from_string(color)
    if size: f.size = Pt(size)
    if bold is not None: f.bold = bold
for n in ("Normal","Body Text","First Paragraph","Compact"): 
    try: style(n, "17231C", 10.5)
    except KeyError: pass
style("Title", "0B3D26", 26, True); style("Subtitle", "0F6B3E", 13)
style("Heading 1", "0B3D26", 18, True); style("Heading 2", "0F6B3E", 14, True); style("Heading 3", "B24A26", 12, True)
# Gold rule under Heading 2.
pPr = next(x for x in d.styles if x.name == "Heading 2").element.get_or_add_pPr()
bdr = OxmlElement("w:pBdr"); b = OxmlElement("w:bottom")
for k,v in (("w:val","single"),("w:sz","12"),("w:space","2"),("w:color","E9B530")): b.set(qn(k), v)
bdr.append(b); pPr.append(bdr)
d.save("ref-styled.docx")
docs = {"en": ("03-sop-onboarding-a-business.md", "Onboarding a business", "RestoCool · Standard operating procedure no. 3 · November 2026"),
        "fr": ("03-sop-onboarding-a-business.fr.md", "Mettre en service un établissement", "RestoCool · Procédure opérationnelle n° 3 · novembre 2026")}
for code,(src,title,sub) in docs.items():
    md = (REPO/"docs/platform"/src).read_text()
    md = re.sub(r"^# .*\n", "", md, count=1)
    out = src.replace(".md",".docx")
    subprocess.run(["pandoc","-f","gfm","-o",out,"--reference-doc=ref-styled.docx","-M",f"title={title}","-M",f"subtitle={sub}","-M",f"lang={code}"], input=md, text=True, check=True)
    # Header row of every table: green with white text.
    doc = Document(out)
    for t in doc.tables:
        for cell in t.rows[0].cells:
            tcPr = cell._tc.get_or_add_tcPr(); sh = OxmlElement("w:shd")
            sh.set(qn("w:val"),"clear"); sh.set(qn("w:color"),"auto"); sh.set(qn("w:fill"),"0F6B3E"); tcPr.append(sh)
            for p in cell.paragraphs:
                for r in p.runs: r.font.color.rgb = RGBColor(255,255,255); r.font.bold = True
    doc.save(out); print("docx", out)
