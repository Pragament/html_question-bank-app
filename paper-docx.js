import { LETTERS, xml, zip } from './paper-core.js';

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export async function downloadPaperDocx({title,items,passages,settings,clean,download,filename}) {
    const files = {}, relationships = [], images = new Map();
    const halfPoints = Math.round(settings.textSize * 2);
    const columns = Math.max(1,Math.min(4,settings.columns));
    const pageWidth = 10466; // A4 minus 720 twips on each side.
    const columnWidth = Math.floor((pageWidth - (columns-1)*360)/columns);
    const imageScale = Math.max(25, Math.min(200, Number(settings.imageSize) || 100)) / 100;
    let drawingId = 0;
    const run = (value, properties='') => {
        const tags=new Map([...properties.matchAll(/<w:(\w+)\b[^>]*\/>/g)].map(match=>[match[1],match[0]]));
        const before=['rFonts','b','i'].map(tag=>tags.get(tag) || '').join('');
        const after=['u','vertAlign'].map(tag=>tags.get(tag) || '').join('');
        return `<w:r><w:rPr>${before}<w:sz w:val="${halfPoints}"/>${after}</w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r>`;
    };
    const paragraph = (content, properties='') => `<w:p><w:pPr>${properties}<w:spacing w:after="100"/></w:pPr>${content}</w:p>`;
    async function imageRun(element, maxWidth) {
        const src=element.getAttribute('src'); if(!src)throw new Error('An image has no source.');
        let image=images.get(src);
        if(!image){
            // Canvas normalizes supported web images to a portable PNG for Word.
            const response=await fetch(src,{credentials:'omit'});if(!response.ok)throw new Error(`Could not export image (${response.status}). Use an accessible image or a data URL.`);
            const blob=await response.blob();if(!blob.type.startsWith('image/'))throw new Error('An image URL did not return an image.');
            const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');
            const scale=Math.min(1,2000/bitmap.width);canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
            const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error('Could not encode an image for DOCX.');
            const index=images.size+1,name=`image${index}.png`,id=`rIdImage${index}`;
            files[`word/media/${name}`]=new Uint8Array(await png.arrayBuffer());relationships.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
            image={id,width:canvas.width,height:canvas.height};images.set(src,image);
        }
        const width=Math.min(maxWidth*635,image.width*9525*imageScale,Math.floor(9*914400*image.width/image.height)),height=Math.round(width*image.height/image.width),id=++drawingId;
        return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${id}" name="Illustration ${id}" descr="${xml(element.alt || 'Illustration')}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="Illustration ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }
    async function inline(node,properties='',width=columnWidth) {
        if(node.nodeType===3)return run(node.textContent,properties);
        if(node.nodeType!==1)return '';
        if(node.tagName==='IMG')return imageRun(node,width);
        if(node.tagName==='BR')return '<w:r><w:br/></w:r>';
        if(node.hasAttribute('data-latex'))return run(node.getAttribute('data-latex'),properties);
        const additions={B:'<w:b/>',STRONG:'<w:b/>',I:'<w:i/>',EM:'<w:i/>',U:'<w:u w:val="single"/>',CODE:'<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>',SUB:'<w:vertAlign w:val="subscript"/>',SUP:'<w:vertAlign w:val="superscript"/>'};
        let result='';for(const child of node.childNodes)result+=await inline(child,properties+(additions[node.tagName] || ''),width);return result;
    }
    async function table(element,width) {
        const rows=[...element.rows];if(!rows.length)return '';
        const count=Math.max(...rows.map(row=>[...row.cells].reduce((n,c)=>n+c.colSpan,0)));
        const cellWidth=Math.floor(width/count);
        let body='';
        for(const row of rows){let cells='';for(const cell of row.cells){if(cell.rowSpan>1)throw new Error('DOCX export supports tables without vertically merged cells. Split merged cells before downloading.');cells+=`<w:tc><w:tcPr><w:tcW w:w="${cellWidth*cell.colSpan}" w:type="dxa"/>${cell.colSpan>1?`<w:gridSpan w:val="${cell.colSpan}"/>`:''}</w:tcPr>${await blocks(cell,cellWidth*cell.colSpan)}</w:tc>`;}body+=`<w:tr>${cells}</w:tr>`;}
        return `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(side=>`<w:${side} w:val="single" w:sz="4" w:color="B8C5CF"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${Array.from({length:count},()=>`<w:gridCol w:w="${cellWidth}"/>`).join('')}</w:tblGrid>${body}</w:tbl>`;
    }
    async function blocks(root,width=columnWidth) {
        let output='',pending='';
        const flush=()=>{if(pending){output+=paragraph(pending);pending='';}};
        for(const node of root.childNodes){
            if(node.nodeType===1 && node.tagName==='TABLE'){flush();output+=await table(node,width);}
            else if(node.nodeType===1 && ['P','DIV','PRE','BLOCKQUOTE','UL','OL'].includes(node.tagName)){flush();output+=await blocks(node,width);}
            else if(node.nodeType===1 && node.tagName==='LI'){flush();output+=paragraph(run('• ')+await inline(node,'',width));}
            else if(node.nodeType===1 && node.tagName==='HR'){flush();}
            else pending+=await inline(node,'',width);
        }
        flush();if(output.endsWith('</w:tbl>'))output+=paragraph('');return output || paragraph('');
    }
    async function htmlBlocks(html,width=columnWidth) {const div=document.createElement('div');div.innerHTML=clean(html);return blocks(div,width);}
    async function prefixedBlocks(html,prefix,width=columnWidth) {
        const content=await htmlBlocks(html,width);
        // Keep labels on the same line as the first text paragraph.
        if(content.startsWith('<w:p>'))return content.replace('</w:pPr>','</w:pPr>'+run(prefix,'<w:b/>'));
        return paragraph(run(prefix,'<w:b/>'),'<w:keepNext/>')+content;
    }
    let body=paragraph(run(title,'<w:b/>'),'<w:pStyle w:val="Title"/>')+paragraph(run(`${items.length} questions`));
    const pageSetup='<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>';
    // Keep the heading full width, then start the chosen question columns.
    body+=`<w:p><w:pPr><w:sectPr>${pageSetup}<w:cols w:num="1"/></w:sectPr></w:pPr></w:p>`;
    const passageNumbers=new Map([...passages.keys()].map((id,i)=>[id,i+1])),seen=new Set();
    for(let index=0;index<items.length;index++){
        const item=items[index],q=item.data,p=passages.get(q.comprehensionId);
        if(p&&!seen.has(q.comprehensionId)){seen.add(q.comprehensionId);const linked=items.flatMap((it,i)=>it.data.comprehensionId===q.comprehensionId?[i+1]:[]);body+=paragraph(run(`Passage P${passageNumbers.get(q.comprehensionId)} · Questions ${linked.join(', ')}`,'<w:b/>'),'<w:keepNext/>')+await htmlBlocks(p.passageHtml);}
        let questionBody=await prefixedBlocks(q.promptHtml,`${index+1}.${p?` [P${passageNumbers.get(q.comprehensionId)}]`:''} `);
        const layout=item.layout || settings.defaultOptionsLayout,cols=layout==='1x4'?4:layout==='2x2'?2:1,cellWidth=Math.floor(columnWidth/cols);
        let optionRows='';
        for(let position=0;position<4;position+=cols){let cells='';for(let c=0;c<cols;c++){const at=position+c;cells+=`<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/></w:tcPr>${await prefixedBlocks(q.options[item.order[at]].html,`${LETTERS[at]}. `,cellWidth-100)}</w:tc>`;}optionRows+=`<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr>`;}
        questionBody+=`<w:tbl><w:tblPr><w:tblW w:w="${columnWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${Array.from({length:cols},()=>`<w:gridCol w:w="${cellWidth}"/>`).join('')}</w:tblGrid>${optionRows}</w:tbl>`;
        body+=questionBody.replaceAll('<w:pPr>','<w:pPr><w:keepNext/>')+paragraph('');
    }
    body+=`<w:sectPr><w:type w:val="continuous"/>${pageSetup}<w:cols w:num="${columns}" w:space="360"/></w:sectPr>`;
    files['word/document.xml']=declaration+`<w:document xmlns:w="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}</w:body></w:document>`;
    files['word/styles.xml']=declaration+`<w:styles xmlns:w="${NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="${halfPoints}"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/></w:rPr></w:style></w:styles>`;
    files['word/_rels/document.xml.rels']=declaration+`<Relationships xmlns="${REL}"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${relationships.join('')}</Relationships>`;
    files['_rels/.rels']=declaration+`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    files['[Content_Types].xml']=declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
    download(zip(files),filename);
}
