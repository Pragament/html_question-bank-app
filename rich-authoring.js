const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const FORMULAS = [
    ['x Squared','Mathematics','x^2'],['x Cubed','Mathematics','x^3'],['Square Root','Mathematics','\\sqrt{x}'],
    ['Fraction','Mathematics','\\frac{a}{b}'],['Quadratic Formula','Mathematics','x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}'],
    ['Pythagorean Theorem','Mathematics','a^2+b^2=c^2'],['Area of a Circle','Mathematics','A=\\pi r^2'],['Sum','Mathematics','\\sum_{i=1}^{n} i'],
    ['Speed','Physics','v=\\frac{d}{t}'],['Force','Physics','F=ma'],['Energy','Physics','E=mc^2'],['Ohm’s Law','Physics','V=IR'],
    ['Water','Chemistry','\\mathrm{H_2O}'],['Chemical Reaction','Chemistry','2\\mathrm{H_2}+\\mathrm{O_2}\\rightarrow 2\\mathrm{H_2O}']
].map(([name, category, latex]) => ({name, category, latex}));
const DIAGRAMS = [
    ['Pie Chart','pie title Pets owned by staff\n    "Dogs" : 386\n    "Cats" : 85'],
    ['Flowchart','flowchart TD\n A[Start] --> B{Is it correct?}\n B -->|Yes| C[Continue]\n B -->|No| D[Try again]'],
    ['Sequence Diagram','sequenceDiagram\n Alice->>Bob: Hello, how are you?\n Bob-->>Alice: I am good!'],
    ['Class Diagram','classDiagram\n Animal <|-- Duck\n Animal : +String name\n Duck : +swim()'],
    ['State Diagram','stateDiagram-v2\n [*] --> Ready\n Ready --> Working\n Working --> Done\n Done --> [*]'],
    ['ER Diagram','erDiagram\n TEACHER ||--o{ CLASS : teaches\n CLASS ||--o{ STUDENT : contains']
].map(([name, code]) => ({name, code}));
const scripts = new Map();
function loadScript(url, ready) {
    if (ready()) return Promise.resolve();
    if (scripts.has(url)) return scripts.get(url);
    const promise = new Promise((resolve,reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => { script.remove(); reject(new Error('Editor library timed out. Check your connection and try again.')); },20000);
        script.src=url;
        script.onload=()=>{ clearTimeout(timer); ready() ? resolve() : reject(new Error('Editor library did not initialize.')); };
        script.onerror=()=>{ clearTimeout(timer); script.remove(); reject(new Error('Could not load the editor library. Check your connection and try again.')); };
        document.head.appendChild(script);
    }).catch(error=>{scripts.delete(url);throw error;});
    scripts.set(url,promise);return promise;
}
function loadCss(url) {
    if ([...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href===url)) return;
    const link=document.createElement('link');link.rel='stylesheet';link.href=url;document.head.appendChild(link);
}
function readStorage(key) {try {const value=JSON.parse(localStorage.getItem(key) || '[]');return Array.isArray(value)?value:[];}catch{return [];}}
function store(key,value) {localStorage.setItem(key,JSON.stringify(value));}
export function safeAuthoringHtml(html) {
    const template=document.createElement('template');template.innerHTML=String(html || '');
    template.content.querySelectorAll('script,style,iframe,object,embed,foreignObject,form,input,button,textarea,select').forEach(el=>el.remove());
    template.content.querySelectorAll('*').forEach(el=>{
        [...el.attributes].forEach(attribute=>{
            if (/^on/i.test(attribute.name) || ['srcset','style'].includes(attribute.name)) el.removeAttribute(attribute.name);
        });
        if(el.hasAttribute('href') && !/^(https?:\/\/|#)/i.test(el.getAttribute('href')))el.removeAttribute('href');
        if(el.tagName==='IMG' && !/^(https?:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(el.getAttribute('src') || ''))el.remove();
    });
    return template.innerHTML;
}
export function readCropLibrary(storage = localStorage) {
    const value = JSON.parse(storage.getItem('qb_image_crop_library_v1') || '[]');
    if (!Array.isArray(value)) throw new Error('The saved image library is not a list.');
    return value.filter(item => item && typeof item.id === 'string' && typeof item.image === 'string'
        && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(item.image));
}

export async function imageFileData(file) {
    if(!file || !/^image\/(png|jpeg|gif|webp)$/i.test(file.type))throw new Error('Use a PNG, JPEG, GIF, or WebP image.');
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read the image.'));reader.readAsDataURL(file);});
}
export async function diagramPng(svg) {
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    try {
        const image=new Image();image.src=url;await image.decode();
        const canvas=document.createElement('canvas'),width=image.naturalWidth || 800,height=image.naturalHeight || 400;
        canvas.width=Math.min(1600,width);canvas.height=Math.max(1,Math.round(height*canvas.width/width));
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
    } finally {URL.revokeObjectURL(url);}
}

export function createRichAuthoring({selector, clean=safeAuthoringHtml, onError=message=>console.error(message), onTarget=()=>{}}) {
    let target=null, savedRange=null, session=null, mode='equation', category='All Formulas', zoom=1, previewVersion=0, openVersion=0, syncing=false;
    let toastEditor=null, latestSvg='', galleryItems=[], librarySelection=null;
    const dialog=document.createElement('dialog');dialog.id='richAuthoringDialog';dialog.className='authoring-dialog';dialog.setAttribute('aria-labelledby','authoringTitle');
    dialog.innerHTML=`<div class="authoring-shell">
        <header class="authoring-head"><h2 id="authoringTitle">Insert Equation</h2><button type="button" data-author-action="close" aria-label="Close insertion dialog">×</button></header>
        <div class="authoring-body">
            <section data-author-pane="library"><label class="authoring-label">Search formulas and diagrams<input id="authoringSearch" type="search" placeholder="Search formula by name, category, or LaTeX…"></label>
                <div class="authoring-library"><nav id="authoringCategories" aria-label="Formula categories"></nav><div id="authoringGallery" class="authoring-gallery"></div></div>
                <section id="authoringVisual" class="authoring-visual"><label class="authoring-label" for="authoringMathfield">MathLive editor (visual)</label><div id="authoringMathHost"><p>Loading visual equation editor…</p></div></section>
                <div class="authoring-edit-grid"><label class="authoring-label" id="authoringSourceLabel">LaTeX editor<textarea id="authoringSource" rows="5" placeholder="Type, edit, or paste your expression here…"></textarea></label>
                    <section><div class="authoring-preview-head"><strong>Live preview</strong><div id="authoringZoom"><button type="button" data-author-action="zoomOut" aria-label="Zoom diagram out">−</button><button type="button" data-author-action="fit">Fit</button><button type="button" data-author-action="zoomIn" aria-label="Zoom diagram in">+</button></div></div><div id="authoringPreview" class="authoring-preview"><div id="authoringPreviewContent"></div></div></section></div>
            </section>
            <section data-author-pane="markdown" hidden><p class="authoring-note">Create tables, lists, headings, and formatted text. Switch between Markdown and WYSIWYG below. Content is inserted at your saved cursor position.</p><div id="authoringToastHost"></div></section>
            <section data-author-pane="image" hidden><p>Paste images directly at the cursor, or select an image below.</p><label class="authoring-label">Image file<input id="authoringImageFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label><label class="authoring-label">Image URL (optional)<input id="authoringImageUrl" type="url" placeholder="https://… or data:image/png;base64,…"></label><label class="authoring-label">Description<input id="authoringImageAlt" placeholder="Describe the image"></label><div id="authoringImagePreview"></div></section>
            <section data-author-pane="images" hidden>
                <p class="authoring-note">Choose a saved crop from Image Utility. The current processed image is inserted at your saved cursor position.</p>
                <div class="authoring-library-actions"><a href="image-utility.html" target="_blank" rel="noopener">Open Image Utility</a><button type="button" data-author-action="refreshImages">Refresh library</button></div>
                <label class="authoring-label">Search images<input id="authoringImageSearch" type="search" placeholder="Search by image name…"></label>
                <div id="authoringImageGallery" class="authoring-image-gallery" role="group" aria-label="Saved image library"></div>
                <label class="authoring-label">Description (optional)<input id="authoringLibraryAlt" placeholder="Use the saved image name"></label>
            </section>
            <p id="authoringStatus" role="status" aria-live="polite"></p>
        </div>
        <footer class="authoring-footer"><button type="button" data-author-action="close">Cancel</button><button type="button" id="authoringSaveEquation" data-author-action="save">Save Equation</button><span></span><button type="button" id="authoringInsert" class="authoring-primary" data-author-action="insert">Insert Equation</button></footer>
    </div>`;
    document.body.appendChild(dialog);
    const get=id=>dialog.querySelector('#'+id);
    const error=message=>{get('authoringStatus').textContent=message;get('authoringStatus').className='authoring-error';};
    const matches=element=>element?.closest?.(selector);
    const editable=element=>element?.isConnected && !element.closest('[hidden]') && (element.matches('textarea,input') ? !element.disabled && !element.readOnly : element.isContentEditable) && (!element.closest('dialog') || element.closest('dialog').open);
    const label=element=>element.getAttribute('aria-label') || element.closest('label')?.textContent?.trim().slice(0,65) || element.id || 'Text editor';
    function capture(element=target) {
        if(!element || !editable(element))return;
        target=element;
        if(element.matches('textarea,input'))savedRange={start:element.selectionStart,end:element.selectionEnd};
        else {const selection=window.getSelection();if(selection.rangeCount && element.contains(selection.anchorNode) && element.contains(selection.focusNode))savedRange=selection.getRangeAt(0).cloneRange();else if(!savedRange || !(savedRange instanceof Range) || !element.contains(savedRange.commonAncestorContainer))savedRange=null;}
    }
    function snapshot() {
        const focused=matches(document.activeElement);
        if(focused && !dialog.contains(focused) && editable(focused)){if(target!==focused)savedRange=null;capture(focused);}else capture();
        if(!editable(target))throw new Error('Place the cursor in an editable question, option, or text field first.');
        return {element:target,range:savedRange instanceof Range ? savedRange.cloneRange() : savedRange ? {...savedRange} : null};
    }
    function insert(snapshot,html,plain='') {
        const element=snapshot.element;
        if(!editable(element))throw new Error('The original editor is no longer editable. Place the cursor again.');
        element.focus();
        if(element.matches('textarea,input')){
            const start=snapshot.range?.start ?? element.value.length,end=snapshot.range?.end ?? start;
            element.setRangeText(plain,start,end,'end');
        } else {
            let range=snapshot.range;
            if(!range || !element.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(element);range.collapse(false);}
            const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
            document.execCommand('insertHTML',false,clean(safeAuthoringHtml(html)));
        }
        element.dispatchEvent(new Event('input',{bubbles:true}));
        element.dispatchEvent(new Event('change',{bubbles:true}));
        if(!element.matches('textarea,input'))element.querySelectorAll('[data-latex]').forEach(renderFormula);
        target=element;capture(element);
    }
    function renderFormula(token) {
        if(window.katex)token.innerHTML=window.katex.renderToString(token.dataset.latex,{throwOnError:false});
    }
    document.addEventListener('focusin',event=>{const element=matches(event.target);if(!element || dialog.contains(element) || !editable(element))return;if(target!==element)savedRange=null;capture(element);onTarget(label(element));});
    document.addEventListener('selectionchange',()=>{if(target && !dialog.open && !target.matches('textarea,input'))capture();});
    for(const eventName of ['keyup','mouseup','select'])document.addEventListener(eventName,event=>{const element=matches(event.target);if(element && !dialog.contains(element))capture(element);});
    document.addEventListener('paste',event=>{
        const element=matches(event.target);
        if(!element || dialog.contains(element) || !editable(element))return;
        const files=[...(event.clipboardData?.items || [])].filter(item=>item.kind==='file' && item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
        if(!files.length)return;
        event.preventDefault();event.stopImmediatePropagation();
        if(target!==element)savedRange=null;capture(element);const destination=snapshot();
        Promise.all(files.map(imageFileData)).then(urls=>{
            insert(destination,urls.map(src=>`<img src="${escapeHtml(src)}" alt="Pasted image">`).join(''),urls.map(src=>`![Pasted image](${src})`).join('\n'));
        }).catch(error=>onError(error.message));
    },true);
    function renderImageLibrary() {
        try {
            const images = readCropLibrary();
            if (!images.some(item => item.id === librarySelection)) librarySelection = null;
            const query = get('authoringImageSearch').value.trim().toLowerCase();
            const visible = images.filter(item => (item.name || 'Untitled crop').toLowerCase().includes(query));
            get('authoringImageGallery').innerHTML = visible.map(item => `
                <label class="authoring-image-card ${item.id === librarySelection ? 'selected' : ''}">
                    <input type="radio" name="authoringLibraryImage" value="${escapeHtml(item.id)}" ${item.id === librarySelection ? 'checked' : ''}>
                    <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name || 'Untitled crop')}" loading="lazy">
                    <strong>${escapeHtml(item.name || 'Untitled crop')}</strong>
                    <small>${escapeHtml(item.width || '?')} × ${escapeHtml(item.height || '?')} · ${escapeHtml(item.mode || 'Original')}</small>
                </label>`).join('') || `<p class="authoring-note">${images.length ? 'No images match your search.' : 'No saved images yet. Open Image Utility, save crops to the library, then click Refresh library.'}</p>`;
            get('authoringInsert').disabled = !librarySelection;
            get('authoringStatus').textContent = `${images.length} saved image${images.length === 1 ? '' : 's'}${librarySelection ? ' · 1 selected' : ''}`;
        } catch (reason) {
            librarySelection = null;
            get('authoringImageGallery').replaceChildren();
            get('authoringInsert').disabled = true;
            error(`Could not read the image library: ${reason.message}`);
        }
    }
    function selectedLatex() {const node=savedRange instanceof Range ? savedRange.commonAncestorContainer : null;return(node?.nodeType===1?node:node?.parentElement)?.closest('[data-latex]')?.dataset.latex || '';}
    function library() {const custom=readStorage('qb_custom_formulas_v1');return [...custom.map(item=>({...item,custom:true})),...FORMULAS];}
    function setSource(value) {get('authoringSource').value=value;if(get('authoringMathfield') && mode==='equation'){syncing=true;get('authoringMathfield').value=value;syncing=false;}updatePreview();}
    function setCategory(next) {const previousMode=mode;category=next;mode=next==='Mermaid'?'diagram':'equation';if(previousMode!==mode)setSource(mode==='diagram'?DIAGRAMS[0].code:'');if(mode==='diagram' && window.mermaid)window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',flowchart:{htmlLabels:false}});get('authoringVisual').hidden=mode==='diagram';get('authoringZoom').hidden=mode!=='diagram';get('authoringSourceLabel').firstChild.textContent=mode==='diagram'?'Mermaid code editor':'LaTeX editor';get('authoringTitle').textContent=mode==='diagram'?'Insert Diagram':'Insert Equation';get('authoringInsert').textContent=mode==='diagram'?'Insert Diagram':'Insert Equation';get('authoringSaveEquation').textContent=mode==='diagram'?'Save Diagram':'Save Equation';renderGallery();if(mode==='equation')initMathLive();else if(!get('authoringSource').value.includes('\n'))setSource(DIAGRAMS[0].code);updatePreview();}
    function renderGallery() {
        const categories=['All Formulas','Mathematics','Physics','Chemistry','Recently Used','Favorites','Mermaid'];
        get('authoringCategories').innerHTML=categories.map(name=>`<button type="button" data-category="${name}" class="${category===name?'selected':''}" aria-pressed="${category===name}">${name}</button>`).join('');
        const query=get('authoringSearch').value.toLowerCase(),favorites=readStorage('qb_favorite_formulas_v1'),recent=readStorage('qb_recent_formulas_v1');
        galleryItems=mode==='diagram'?[...readStorage('qb_saved_diagrams_v1').map(item=>({...item,custom:true})),...DIAGRAMS]:library();
        if(mode==='equation'){
            if(category==='Recently Used')galleryItems=recent.map(latex=>library().find(item=>item.latex===latex) || {name:latex,latex,category:'Recently Used'});
            else if(category==='Favorites')galleryItems=galleryItems.filter(item=>favorites.includes(item.latex));
            else if(category!=='All Formulas')galleryItems=galleryItems.filter(item=>item.category===category || item.custom && item.category==='Custom');
        }
        galleryItems=galleryItems.filter(item=>`${item.name} ${item.category || ''} ${item.latex || item.code}`.toLowerCase().includes(query));
        const cards=(items,heading)=>`<h3>${heading}</h3><div class="authoring-cards">${items.map(item=>{const index=galleryItems.indexOf(item);return `<div class="authoring-card"><button type="button" data-pick="${index}" title="${escapeHtml(item.latex || item.code)}"><strong>${escapeHtml(item.name)}</strong><span class="authoring-card-preview" ${item.latex?`data-latex="${escapeHtml(item.latex)}"`:''}>${escapeHtml(item.latex || 'Diagram preview')}</span></button>${item.latex?`<button type="button" class="authoring-star" data-favorite="${index}" aria-label="${favorites.includes(item.latex)?'Remove from':'Add to'} favorites: ${escapeHtml(item.name)}" aria-pressed="${favorites.includes(item.latex)}">${favorites.includes(item.latex)?'★':'☆'}</button>`:''}</div>`;}).join('') || '<p class="authoring-note">No saved items in this category yet.</p>'}</div>`;
        get('authoringGallery').innerHTML=cards(galleryItems.filter(item=>item.custom),'My '+(mode==='diagram'?'diagrams':'equations'))+cards(galleryItems.filter(item=>!item.custom),'Built-in '+(mode==='diagram'?'diagrams':'formulas'));
        get('authoringGallery').querySelectorAll('[data-latex]').forEach(renderFormula);
        if(mode==='diagram' && window.mermaid){const version=openVersion;galleryItems.forEach(async(item,index)=>{try{const {svg}=await window.mermaid.render(`author_card_${Date.now()}_${index}`,item.code);if(version===openVersion && mode==='diagram'){const preview=get('authoringGallery').querySelector(`[data-pick="${index}"] .authoring-card-preview`);if(preview)preview.innerHTML=svg;}}catch{}});}
    }
    async function initMathLive() {
        const version=openVersion;
        try {
            await loadScript('https://unpkg.com/mathlive@0.101.1',()=>!!customElements.get('math-field'));
            if(version!==openVersion || !dialog.open)return;
            let math=get('authoringMathfield');
            if(!math){math=document.createElement('math-field');math.id='authoringMathfield';math.setAttribute('aria-label','Visual equation editor');math.mathVirtualKeyboardPolicy='manual';get('authoringMathHost').replaceChildren(math);math.addEventListener('input',()=>{if(syncing)return;get('authoringSource').value=math.value;updatePreview();});}
            if(window.mathVirtualKeyboard)window.mathVirtualKeyboard.container=dialog;
            syncing=true;math.value=get('authoringSource').value;syncing=false;
        } catch(reason) {if(version===openVersion){get('authoringMathHost').textContent='Visual editor unavailable. You can still enter LaTeX below.';error(reason.message);}}
    }
    async function updatePreview() {
        const version=++previewVersion,code=get('authoringSource').value.trim();latestSvg='';zoom=1;get('authoringPreviewContent').style.transform='';
        get('authoringStatus').textContent='';
        if(!code){get('authoringPreviewContent').textContent=mode==='diagram'?'Diagram preview will be shown here':'Equation preview will be shown here';return;}
        if(mode==='diagram'){
            if(!window.mermaid){get('authoringPreviewContent').textContent='Diagram renderer is still loading.';return;}
            try {const {svg}=await window.mermaid.render(`author_preview_${Date.now()}_${version}`,code);if(version!==previewVersion || !dialog.open)return;latestSvg=svg;get('authoringPreviewContent').innerHTML=svg;}
            catch(reason){if(version===previewVersion){get('authoringPreviewContent').textContent='Diagram could not render. Check the Mermaid syntax.';error(reason.message);}}
        } else {
            try {get('authoringPreviewContent').innerHTML=window.katex?window.katex.renderToString(code,{throwOnError:true,displayMode:true}):escapeHtml(code);}
            catch(reason){get('authoringPreviewContent').textContent='Invalid equation. Check the LaTeX syntax.';error(reason.message);}
        }
    }
    async function initializeMarkdown(version) {
        try {
            loadCss('https://uicdn.toast.com/editor/3.2.2/toastui-editor.min.css');
            await loadScript('https://uicdn.toast.com/editor/3.2.2/toastui-editor-all.min.js',()=>!!window.toastui?.Editor);
            if(version!==openVersion || !dialog.open)return;
            if(!toastEditor)toastEditor=new window.toastui.Editor({el:get('authoringToastHost'),height:'400px',initialEditType:'wysiwyg',previewStyle:'vertical',usageStatistics:false,toolbarItems:[['heading','bold','italic'],['ul','ol'],['table'],['code','codeblock']],hooks:{addImageBlobHook:(blob,callback)=>{imageFileData(blob).then(url=>callback(url,'Pasted image')).catch(reason=>error(reason.message));return false;}}});
            toastEditor.setMarkdown('');toastEditor.focus();get('authoringInsert').disabled=false;get('authoringStatus').textContent='';
        } catch(reason){if(version===openVersion)error(reason.message);}
    }
    async function apply() {
        if(!session)return;
        let html='',plain='';
        get('authoringInsert').disabled=true;
        try {
            if(mode==='markdown'){
                if(!toastEditor)throw new Error('Markdown editor is still loading.');
                html=toastEditor.getHTML();plain=toastEditor.getMarkdown();if(!plain.trim())throw new Error('Add content before inserting.');
            } else if(mode==='image-library'){
                const image=readCropLibrary().find(item=>item.id===librarySelection);
                if(!image)throw new Error('Choose a library image. If it was deleted in Image Utility, refresh the library.');
                const alt=get('authoringLibraryAlt').value.trim() || image.name || 'Question illustration';
                html=`<img src="${escapeHtml(image.image)}" alt="${escapeHtml(alt)}">`;
                plain=`![${alt}](${image.image})`;
            } else if(mode==='image'){
                const file=get('authoringImageFile').files[0],alt=get('authoringImageAlt').value.trim() || 'Question illustration';
                const src=file?await imageFileData(file):get('authoringImageUrl').value.trim();
                if(!/^(https:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(src))throw new Error('Choose an image file or enter an HTTPS image URL.');
                html=`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;plain=`![${alt}](${src})`;
            } else {
                const code=get('authoringSource').value.trim();if(!code)throw new Error('Enter an equation or diagram first.');
                if(mode==='diagram'){
                    await updatePreview();if(!latestSvg)throw new Error('Fix the diagram syntax before inserting.');
                    const src=await diagramPng(latestSvg);html=`<img src="${src}" alt="${escapeHtml(code)}">`;plain=`[mermaid]${code}[/mermaid]`;
                } else {
                    if(window.katex)window.katex.renderToString(code,{throwOnError:true});
                    html=`<span class="math-token" data-latex="${escapeHtml(code)}" contenteditable="false">${escapeHtml(code)}</span>&nbsp;`;plain=`\\(${code}\\)`;
                    try {store('qb_recent_formulas_v1',[code,...readStorage('qb_recent_formulas_v1').filter(item=>item!==code)].slice(0,20));} catch { /* Optional history must not block insertion. */ }
                }
            }
            const destination=session;dialog.close();insert(destination,html,plain);
        } catch(reason){if(dialog.open)error(reason.message);else onError(reason.message);}
        finally{get('authoringInsert').disabled=false;}
    }
    dialog.addEventListener('click',event=>{
        const categoryButton=event.target.closest('[data-category]');if(categoryButton){setCategory(categoryButton.dataset.category);return;}
        const pick=event.target.closest('[data-pick]');if(pick){setSource(galleryItems[Number(pick.dataset.pick)].latex || galleryItems[Number(pick.dataset.pick)].code);return;}
        const favorite=event.target.closest('[data-favorite]');if(favorite){try{const latex=galleryItems[Number(favorite.dataset.favorite)].latex,current=readStorage('qb_favorite_formulas_v1');store('qb_favorite_formulas_v1',current.includes(latex)?current.filter(item=>item!==latex):[...current,latex]);renderGallery();}catch(reason){error(reason.message);}return;}
        const action=event.target.closest('[data-author-action]')?.dataset.authorAction;
        if(action==='close')dialog.close();
        if(action==='refreshImages')renderImageLibrary();
        if(action==='insert')apply();
        if(action==='save'){
            const code=get('authoringSource').value.trim();if(!code){error('Enter an equation or diagram to save.');return;}
            const name=window.prompt(mode==='diagram'?'Diagram name':'Equation name');if(!name?.trim())return;
            try{const key=mode==='diagram'?'qb_saved_diagrams_v1':'qb_custom_formulas_v1';const entry=mode==='diagram'?{name:name.trim(),code}:{name:name.trim(),latex:code,category:'Custom',id:`custom_${Date.now()}`};store(key,[entry,...readStorage(key).filter(item=>mode==='diagram'?item.code!==code:item.latex!==code)]);renderGallery();get('authoringStatus').textContent='Saved to your library.';}catch(reason){error(reason.message);}
        }
        if(['zoomIn','zoomOut','fit'].includes(action)){zoom=action==='fit'?1:Math.max(.25,Math.min(3,zoom+(action==='zoomIn' ? 0.25 : -0.25)));get('authoringPreviewContent').style.transform=`scale(${zoom})`;}
    });
    get('authoringSearch').addEventListener('input',renderGallery);
    get('authoringSource').addEventListener('input',()=>{if(get('authoringMathfield') && mode==='equation'){syncing=true;get('authoringMathfield').value=get('authoringSource').value;syncing=false;}updatePreview();});
    get('authoringImageSearch').addEventListener('input',renderImageLibrary);
    get('authoringImageGallery').addEventListener('change',event=>{
        const radio=event.target.closest('input[name="authoringLibraryImage"]');
        if(!radio)return;
        librarySelection=radio.value;
        get('authoringImageGallery').querySelectorAll('.authoring-image-card').forEach(card=>card.classList.toggle('selected',card.contains(radio)));
        get('authoringInsert').disabled=false;
        get('authoringStatus').textContent='1 image selected. Insert it at the saved cursor position.';
    });
    window.addEventListener('storage',event=>{if(event.key==='qb_image_crop_library_v1' && dialog.open && mode==='image-library')renderImageLibrary();});
    get('authoringImageFile').addEventListener('change',async()=>{try{const file=get('authoringImageFile').files[0];get('authoringImagePreview').innerHTML=file?`<img src="${await imageFileData(file)}" alt="Image preview">`:'';}catch(reason){error(reason.message);}});
    dialog.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();event.stopPropagation();if(!get('authoringInsert').disabled)apply();}});
    dialog.addEventListener('close',()=>{if(dialog.open)return;openVersion++;previewVersion++;if(window.mathVirtualKeyboard?.visible)window.mathVirtualKeyboard.hide();});
    return {
        reset() { target=null; savedRange=null; session=null; },
        enhance(root) { root.querySelectorAll('[data-latex]').forEach(token => { token.contentEditable = 'false'; renderFormula(token); }); },
        open(kind) {
            try{
                session=snapshot();mode=kind==='table'||kind==='markdown'?'markdown':kind==='image-library'?'image-library':kind==='image'?'image':kind==='diagram'?'diagram':'equation';
                const version=++openVersion;
                dialog.querySelectorAll('[data-author-pane]').forEach(pane=>pane.hidden=pane.dataset.authorPane!==(mode==='markdown'?'markdown':mode==='image-library'?'images':mode==='image'?'image':'library'));
                get('authoringSaveEquation').hidden=mode==='markdown'||mode==='image'||mode==='image-library';get('authoringStatus').textContent='';get('authoringSearch').value='';get('authoringInsert').disabled=false;
                get('authoringImageFile').value='';get('authoringImageUrl').value='';get('authoringImageAlt').value='';get('authoringImagePreview').innerHTML='';
                get('authoringTitle').textContent=mode==='markdown'?'Advanced Editor (Tables & Lists)':mode==='image-library'?'Insert from Image Library':mode==='image'?'Insert Image':mode==='diagram'?'Insert Diagram':'Insert Equation';
                get('authoringInsert').textContent=mode==='markdown'?'Insert Content':mode==='image-library'?'Insert Image':mode==='image'?'Insert Image':mode==='diagram'?'Insert Diagram':'Insert Equation';
                librarySelection=null;get('authoringImageSearch').value='';get('authoringLibraryAlt').value='';
                dialog.showModal();
                if(mode==='markdown'){get('authoringInsert').disabled=true;get('authoringStatus').textContent='Loading Markdown / WYSIWYG editor…';initializeMarkdown(version);}
                else if(mode==='image-library'){renderImageLibrary();get('authoringImageSearch').focus();}
                else if(mode!=='image'){setCategory(mode==='diagram'?'Mermaid':'All Formulas');setSource(mode==='diagram'?DIAGRAMS[0].code:selectedLatex());get('authoringSearch').focus();}
            }catch(reason){onError(reason.message);}
        },
        command(command) {
            try{const destination=snapshot();if(destination.element.matches('textarea,input'))throw new Error('Text formatting is available in the rich question and option editors.');destination.element.focus();if(destination.range){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(destination.range);}if(command==='code'){const text=window.getSelection().toString() || 'code';insert(destination,`<code>${escapeHtml(text)}</code>`,text);}else{document.execCommand(command,false,null);destination.element.dispatchEvent(new Event('input',{bubbles:true}));capture(destination.element);}}catch(reason){onError(reason.message);}
        }
    };
}
