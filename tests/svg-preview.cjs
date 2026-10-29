// Offline browser check: PLAYWRIGHT_MODULE / PLAYWRIGHT_EXECUTABLE can select a local runtime.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.setContent('<!doctype html><html><head></head><body><div class="import-table-scroll"><table class="import-table"><tbody id="preview"></tbody></table></div></body></html>');
  await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8')});
  const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../svg-content.js'),'utf8').replace('export function','function')+'\n'+fs.readFileSync(path.join(__dirname,'../csv-images.js'),'utf8').replace('export function','function')+'\n'+source.slice(source.indexOf('function esc('),source.indexOf('function cssEscape('))+'\n'+source.slice(source.indexOf('function csvRichText('),source.indexOf('function parseCsvQuestions('))});
  const result=await page.evaluate(()=>{
   const source='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 150" width="280" height="150" onload="window.svgExecuted=true"><script>window.svgExecuted=true</script><foreignObject><div>Unsafe</div></foreignObject><image href="https://example.com/image.png"/><rect width="280" height="150" fill="#f7f9fc"/><path d="M 35 115 L 245 115 M 140 115 L 175 30" stroke="#1769aa" stroke-width="3"/><text x="155" y="96" font-size="18">70°</text><circle cx="140" cy="115" r="4" fill="url(https://example.com/paint)" onclick="alert(1)"/></svg>';
   const markdown='![Diagram](data:image/svg+xml,'+encodeURIComponent(source).replace(/[()]/g,char=>'%'+char.charCodeAt(0).toString(16))+')';
   const html=csvRichText('Question diagram: '+markdown);
   document.querySelector('#preview').innerHTML='<tr><td>'+html+'</td><td>'+csvRichText(markdown)+'</td></tr>';
   const invalid=csvRichText('<svg><script>alert(1)</script>');
   return{svgCount:document.querySelectorAll('#preview svg').length,paths:document.querySelectorAll('#preview svg path').length,unsafeNodes:document.querySelectorAll('#preview script, #preview foreignObject, #preview image').length,unsafeAttributes:document.querySelectorAll('#preview [onload], #preview [onclick], #preview [href]').length,externalPaint:document.querySelector('#preview circle').getAttribute('fill'),executed:!!window.svgExecuted,invalidEscaped:invalid.includes('&lt;svg&gt;'),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.equal(result.svgCount,2);assert.equal(result.paths,2);assert.equal(result.unsafeNodes,0);assert.equal(result.unsafeAttributes,0);assert.equal(result.externalPaint,null);assert.equal(result.executed,false);assert.equal(result.invalidEscaped,true);assert.equal(result.overflow,false);
  assert.equal(await page.evaluate(()=>sanitizeInlineSvg('<svg><path></svg>')),'');
  assert.equal(await page.evaluate(()=>sanitizeInlineSvg('<!DOCTYPE svg [<!ENTITY test "bad">]><svg/>')),'');
  await page.screenshot({path:process.env.SVG_TEST_SCREENSHOT || '/private/tmp/svg-preview.png'});
  console.log('PASS: Markdown SVG preview, static shapes, unsafe content removal, invalid SVG fallback, and phone-width layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
