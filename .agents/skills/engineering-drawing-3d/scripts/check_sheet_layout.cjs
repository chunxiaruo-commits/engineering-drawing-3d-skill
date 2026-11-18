// Check the actual offline preview in Chromium at phone and desktop widths.
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

async function verify(filename, executablePath) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath, chromiumSandbox: true });
  try {
    const page = await browser.newPage({ offline: true });
    await page.goto(pathToFileURL(resolve(filename)).href);
    const questions = page.locator('#questions button');
    const total = await questions.count();
    assert.ok(total > 0, 'No question tabs found');
    let checked = 0;
    for (const width of [360, 820, 1059, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (let index = 0; index < total; index++) {
        await questions.nth(index).click();
        for (const [mode, selector] of [['answer', '#answer-image'], ['source', '#source-image']]) {
          const toggle = page.locator(`[data-sheet="${mode}"]`);
          if (mode === 'source' && !await toggle.isVisible()) continue;
          await toggle.click();
          const issues = await page.locator(selector).evaluate(async image => {
            await image.decode();
            const frame = image.closest('.sheet');
            const sheet = frame.getBoundingClientRect();
            const imageBox = image.getBoundingClientRect();
            const style = getComputedStyle(frame);
            const inset = side => parseFloat(style['padding'+side]) + parseFloat(style['border'+side+'Width']);
            const tolerance = 1;
            const overflow = imageBox.left < sheet.left+inset('Left')-tolerance
              || imageBox.right > sheet.right-inset('Right')+tolerance
              || imageBox.top < sheet.top+inset('Top')-tolerance
              || imageBox.bottom > sheet.bottom-inset('Bottom')+tolerance;
            const fit = getComputedStyle(image).objectFit;
            return { overflow, visible: imageBox.width > 0 && imageBox.height > 0,
                     preservesAspect: fit === 'contain' || fit === 'scale-down' };
          });
          assert.deepEqual(issues, { overflow:false, visible:true, preservesAspect:true },
            `Question ${index+1}, ${mode}, ${width}px`);
          checked++;
        }
      }
    }
    await questions.first().click();
    await page.locator('[data-sheet="answer"]').click();
    await page.locator('#expand-drawing').click();
    const measuredWidth = () => page.locator('#dialog-content img').evaluate(img => img.getBoundingClientRect().width);
    const before = await measuredWidth();
    await page.locator('#dialog-larger').click();
    assert.ok(await measuredWidth() > before, 'Drawing did not grow in its zoom dialog');
    console.log(`Checked ${checked} preview layouts and the zoom dialog.`);
  } finally {
    await browser.close();
  }
}

const [filename, executablePath] = process.argv.slice(2);
if (!filename) {
  console.error('Usage: node check_sheet_layout.cjs <offline.html> [Chromium executable]');
  process.exitCode = 1;
} else {
  verify(filename, executablePath).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
