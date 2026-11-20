# Building the styled documents

The styled PDF (cover page, section badges, step circles, checklist) and Word versions of SOP 3, in English and French:

```bash
cd docs/platform/build
python3 build.py /tmp/rc-docs                       # HTML from ../03-sop-onboarding-a-business(.fr).md
cp pdf.cjs /tmp/rc-docs/ && node /tmp/rc-docs/pdf.cjs   # PDF (Playwright Chromium)
(cd /tmp/rc-docs && python3 /home/user/restocool_pro/docs/platform/build/docx.py)   # Word (pandoc + python-docx)
cp /tmp/rc-docs/03-sop-onboarding-a-business*.{pdf,docx} ../downloads/
```

Then rebuild `downloads/restocool-documentation.zip` (`zip -j` of every PDF and DOCX). The Markdown files stay the source: edit them first.
