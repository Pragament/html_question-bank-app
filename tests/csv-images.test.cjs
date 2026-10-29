const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({TextDecoder,Uint8Array,atob});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../csv-images.js'),'utf8').replace('export function','function'),context);
const data='data:image/png;base64,iVBORw0KGgo=';
test('Markdown image rendering preserves raster data and escapes alt text',()=>{
 const html=context.csvMarkdownImage('Diagram " <test>',data);
 assert.ok(html.includes(`src="${data}"`));assert.ok(html.includes('alt="Diagram &quot; &lt;test&gt;"'));
});
test('unsupported, external, and malformed image sources stay unrendered',()=>{
 for(const source of ['javascript:alert(1)','https://example.com/image.png','data:text/html;base64,AAAA','data:image/png;base64,not!base64'])assert.equal(context.csvMarkdownImage('Diagram',source),'');
});
test('SVG Markdown images must pass through the sanitizer after decoding',()=>{
 const source='<svg xmlns="http://www.w3.org/2000/svg"><text>कोण</text></svg>';
 for(const data of ['data:image/svg+xml,'+encodeURIComponent(source),'data:image/svg+xml;base64,'+Buffer.from(source).toString('base64')]){
  let decoded='';const html=context.csvMarkdownImage('Diagram',data,value=>{decoded=value;return '<svg/>';});
  assert.equal(decoded,source);assert.ok(html.includes('class="svg-token"'));
  assert.equal(context.csvMarkdownImage('Diagram',data,()=>''),'');
 }
});
