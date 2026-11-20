const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [f, label] of [["03-sop-onboarding-a-business", "Onboarding a business"], ["03-sop-onboarding-a-business.fr", "Mettre en service un établissement"]]) {
    await p.goto("file://" + path.join(__dirname, f + ".html"));
    await p.pdf({ path: path.join(__dirname, f + ".pdf"), preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:7.5px;width:100%;padding:0 18mm;color:#5b6b60;display:flex;justify-content:space-between;font-family:DejaVu Sans"><span>RestoCool · TIBLOGICS · ${label}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` });
    console.log("pdf", f);
  }
  await b.close();
})();
