import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Optional isolated browser acceptance checks. Never reuse a resident's profile.
const enabled=Boolean(process.env.ANCHOR_BROWSER_TEST_URL&&process.env.ANCHOR_PLAYWRIGHT_MODULE);
async function setup(){
  const {chromium}=await import(process.env.ANCHOR_PLAYWRIGHT_MODULE);
  const browser=await chromium.launch({headless:true,...(process.env.ANCHOR_BROWSER_EXECUTABLE?{executablePath:process.env.ANCHOR_BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.addInitScript(() => localStorage.setItem('anchor-guide-v1','dismissed'));
    await page.goto(process.env.ANCHOR_BROWSER_TEST_URL);
  await page.locator('[data-action="import"]').first().waitFor();
  return {browser,context,page,errors};
}
async function nav(page,name){await page.locator(`.sidebar [data-page="${name}"]`).click();}

test('browser acceptance: source review, preparation, receipts, handoff, calendar, persistence and real/sample isolation', {skip:!enabled,timeout:90_000},async()=>{
  const {browser,page,errors}=await setup();
  try{
    await page.locator('[data-action="review"][data-id="demo-renewal"]').first().click();
    await page.locator('[data-action="source"]').first().click();
    assert.equal(await page.locator('.source-line.highlight').count(),1);
    const count=await page.locator('[data-confirm]').count();
    assert.equal(count,3);
    assert.ok(await page.locator('[data-action="confirm-plan"]').isDisabled());
    for(let index=0;index<count;index++){
      const id=await page.locator('[data-confirm]').nth(index).getAttribute('data-confirm');
      await page.locator('[data-confirm]').nth(index).check();
      await page.waitForTimeout(60);
      assert.equal(await page.evaluate(()=>document.activeElement?.dataset.confirm),id,'focus should survive each date confirmation');
    }
    await page.locator('[data-action="confirm-plan"]').click();
    await page.locator('.task-check').first().click();
    await page.locator('.task-check[aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('.task-check[aria-pressed="true"]').count(),1);

    await page.locator('[data-action="receipt"]').click();
    await page.locator('#receipt-date').fill('2026-10-10');
    await page.locator('#receipt-note').fill('Renewal form sent. Reference ANCHOR-TEST-123.');
    await page.locator('#receipt-file').setInputFiles({name:'fictional-receipt.txt',mimeType:'text/plain',buffer:Buffer.from('Fictional confirmation only')});
    await page.locator('#receipt-form button[type="submit"]').click();
    await page.locator('.evidence-row').waitFor();
    assert.match(await page.locator('.evidence-row').innerText(),/ANCHOR-TEST-123/);
    await page.locator('[data-action="handoff"]').first().click();
    const handoff=await page.locator('#handoff-preview').inputValue();
    assert.match(handoff,/ANCHOR-TEST-123/);
    assert.match(handoff,/fictional-receipt.txt/);
    assert.match(handoff,/Prepared by resident/);
    await page.locator('[data-action="close-modal"]').click();
    await nav(page,'plan');
    const downloadPromise=page.waitForEvent('download');
    await page.locator('[data-action="calendar-all"]').click();
    const ics=await readFile(await(await downloadPromise).path(),'utf8');
    assert.match(ics,/20261015/);
    assert.match(ics,/20261020/);
    assert.match(ics,/20261031/);
    assert.doesNotMatch(ics,/20261024/,'unconfirmed verification date must stay out of exported calendar');
    await page.reload();
    await page.locator('.task-check[aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('.task-check[aria-pressed="true"]').count(),1);
    await nav(page,'evidence');
    assert.match(await page.locator('.evidence-row').innerText(),/ANCHOR-TEST-123/);

    // A personal import from the sample workspace must never become a sample.
    await page.locator('[data-action="import"]').first().click();
    await page.locator('[data-action="import-tab"][data-tab="paste"]').click();
    await page.locator('#notice-name').fill('My imported letter');
    await page.locator('#notice-text').fill('CalFresh CF377.6\nCounty: Santa Clara County\nSubmit requested items by November 18, 2026.\n[X] September pay stubs\n<img src=x onerror="window.injected=true">');
    await page.locator('#paste-form button[type="submit"]').click();
    await page.locator('.source-paper').waitFor();
    assert.equal(await page.locator('.sample-strip').count(),0);
    assert.equal(await page.locator('.source-paper img').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    const stored=await page.evaluate(async()=>{const api=await import('/platform.js');return api.loadState();});
    assert.equal(stored.mode,'personal');
    assert.equal(stored.personal.notices.length,1);
    assert.equal(stored.personal.notices[0].isDemo,false);
    assert.equal(stored.demo.notices.length,2);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('browser acceptance: conflicting dates need explicit clarification; excluded date stays out of calendar', {skip:!enabled,timeout:60_000},async()=>{
  const {browser,page,errors}=await setup();
  try{
    await page.locator('[data-action="import"]').first().click();
    await page.locator('[data-action="import-tab"][data-tab="sample"]').click();
    await page.locator('[data-action="add-sample"][data-id="conflicting-dates"]').click();
    await page.locator('#clarification').waitFor();
    assert.ok(await page.locator('[data-action="confirm-plan"]').isDisabled());
    await page.locator('[data-confirm]').first().check();
    await page.locator('[data-confirm]').nth(1).check();
    assert.ok(await page.locator('[data-action="confirm-plan"]').isDisabled(),'checking competing dates alone must not resolve the conflict');
    await nav(page,'plan');
    await page.locator('[data-action="calendar-all"]').click();
    await page.locator('#clarification').waitFor();
    assert.match(await page.locator('#toast').innerText(),/Clarify the competing dates/);
    await page.locator('[data-exclude]').nth(1).check();
    await page.locator('#clarification').fill('Fictional test: county clarified October 23; October 26 does not apply.');
    await page.locator('#clarification').blur();
    await page.locator('[data-action="confirm-plan"]:not([disabled])').waitFor();
    await page.locator('[data-action="confirm-plan"]').click();
    const downloadPromise=page.waitForEvent('download');
    await page.locator('[data-action="calendar-all"]').click();
    const text=await readFile(await(await downloadPromise).path(),'utf8');
    assert.match(text,/20261023/);
    assert.doesNotMatch(text,/DTSTART;VALUE=DATE:20261026/);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('browser acceptance: mobile navigation, Spanish interface and offline shell remain usable', {skip:!enabled,timeout:60_000},async()=>{
  const {browser,context,page,errors}=await setup();
  try{
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#language').selectOption('es');
    await page.getByRole('heading',{name:'Tu siguiente paso, más claro.'}).waitFor();
    await page.locator('.mobile-nav-toggle').click();
    await nav(page,'notices');
    assert.equal(await page.locator('.shell.nav-open').count(),0);
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.reload();
    await page.locator('.notice-card').first().waitFor();
    await context.setOffline(true);
    await page.reload();
    await page.locator('.notice-card').first().waitFor();
    assert.match(await page.locator('html').getAttribute('lang'),/es/);
    await page.locator('.notice-card [data-action="review"]').first().click();
    await page.locator('.source-paper').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
