import {test,expect} from '@playwright/test';
const pages=[['final-expense','final_expense'],['term-life','term_life'],['living-benefits','term_life_living_benefits']];
async function fill(page){
 await page.getByLabel('Name',{exact:true}).fill('Fictional Example');
 await page.getByLabel('Phone number',{exact:true}).fill('202-555-0142');
 await page.getByLabel('State of residence').selectOption('CA');
 await page.locator('[name=contactConsent]').check();
 await page.locator('[name=fictional]').check();
}
for(const [slug,product] of pages) test(`${slug}: responsive review page and correctly preselected topic`,async({page},info)=>{
 const external=[];page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:8080/')) external.push(request.url());});
 await page.goto(`/review/${slug}/?utm_source=review&email=never-retain@example.invalid`);
 await expect(page.locator('h1')).toBeVisible();
 await expect(page.locator('.independence')).toContainText('not affiliated',{ignoreCase:true});
 await expect(page.locator('[name=product]')).toHaveValue(product);
 await expect(page.locator('[name=contactConsent]')).not.toBeChecked();
 await expect(page.locator('[name=fictional]')).not.toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const calendar=page.locator('a[href^="https://calendar.app.google/"]');
 for(const link of await calendar.all()) await expect(link).toHaveAttribute('href','https://calendar.app.google/PF12N8i49QaFAV7o9');
 expect(external).toEqual([]);
 await page.screenshot({path:info.outputPath(`${slug}.png`),fullPage:true});
});
test('callback prototype rejects missing/real details and performs no network request on repeated tests',async({page})=>{
 const posts=[];page.on('request',r=>{if(r.method()!=='GET')posts.push(r.url());});
 await page.goto('/review/term-life/');
 await page.getByRole('button',{name:'Test form only'}).click();
 await expect(page.locator('#callback-name')).toBeFocused();
 await fill(page);
 await page.getByLabel('Phone number',{exact:true}).fill('415-555-0142');
 await page.getByRole('button',{name:'Test form only'}).click();
 await expect(page.locator('#callback-error')).toContainText('reserved fictional');
 await page.getByLabel('Phone number',{exact:true}).fill('202-555-0142');
 await page.locator('[name=contactConsent]').uncheck();
 await page.getByRole('button',{name:'Test form only'}).click();
 await expect(page.locator('#callback-error')).toContainText('draft callback permission');
 await page.locator('[name=contactConsent]').check();
 await page.getByRole('button',{name:'Test form only'}).click();
 await expect(page.locator('#callback-result')).toContainText('Nothing was sent or saved');
 await expect(page.locator('#callback-name')).toHaveValue('');
 await expect(page.locator('#callback-result')).toBeFocused();
 await page.getByRole('button',{name:'Test form only'}).click();
 await expect(page.locator('#callback-result')).toBeHidden();
 await fill(page);await page.getByRole('button',{name:'Clear answers'}).click();
 await expect(page.locator('#callback-phone')).toHaveValue('');
 expect(posts).toEqual([]);
 expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
 expect(page.url()).not.toContain('Fictional');
});
test('leaving, back/forward and reload clear unsent fictional answers',async({page})=>{
 await page.goto('/review/final-expense/');await fill(page);
 await page.getByRole('link',{name:'Term life insurance',exact:true}).click();
 await page.goBack();await expect(page.locator('#callback-name')).toHaveValue('');
 await fill(page);await page.reload();await expect(page.locator('#callback-name')).toHaveValue('');
 await expect(page.locator('[name=contactConsent]')).not.toBeChecked();
});
test('keyboard navigation, native FAQ controls and page anchors remain usable',async({page})=>{
 await page.goto('/review/living-benefits/');await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
 await page.keyboard.press('Enter');expect(page.url()).toContain('#main');
 const question=page.locator('summary').first();await question.focus();await page.keyboard.press('Enter');
 await expect(page.locator('details').first()).toHaveAttribute('open','');
 await page.getByRole('link',{name:'Review callback form'}).click();expect(page.url()).toContain('#callback');
});
test('JavaScript-disabled review has no active submission controls',async({browser},info)=>{
 const context=await browser.newContext({javaScriptEnabled:false,viewport:info.project.use.viewport});
 const page=await context.newPage();await page.goto('http://127.0.0.1:8080/review/term-life/');
 await expect(page.getByRole('button',{name:'Test form only'})).toBeDisabled();
 await expect(page.locator('noscript')).toBeVisible();await context.close();
});
