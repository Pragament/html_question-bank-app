const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../rich-authoring.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('export function readCropLibrary('),source.indexOf('export async function imageFileData(')).replace('export function','function'),context);
const storage=value=>({getItem:key=>{assert.equal(key,'qb_image_crop_library_v1');return value;}});
test('image library uses the current processed crop and leaves original data untouched',()=>{
 const item={id:'crop',name:'Diagram',original:'data:image/png;base64,QUFB',image:'data:image/png;base64,QkJC',mode:'Black and white',width:80,height:40};
 const result=context.readCropLibrary(storage(JSON.stringify([item])));assert.equal(result.length,1);assert.equal(result[0].image,item.image);assert.equal(result[0].original,item.original);
});
test('empty libraries are supported and invalid records cannot be inserted',()=>{
 assert.equal(context.readCropLibrary(storage(null)).length,0);
 const result=context.readCropLibrary(storage(JSON.stringify([null,{id:'svg',image:'data:image/svg+xml;base64,AAAA'},{image:'data:image/png;base64,AAAA'},{id:'external',image:'https://example.com/x.png'},{id:'valid',image:'data:image/webp;base64,AAAA'}])));
 assert.equal(result.length,1);assert.equal(result[0].id,'valid');
});
test('corrupt library storage is reported without modifying it',()=>{
 assert.throws(()=>context.readCropLibrary(storage('invalid JSON')));
 assert.throws(()=>context.readCropLibrary(storage('{}')),/not a list/);
});
