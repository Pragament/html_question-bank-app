// Accept static vector graphics only; remove active content and external resources.
export function sanitizeInlineSvg(source) {
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) return '';
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const root = document.documentElement;
    const namespace = 'http://www.w3.org/2000/svg';
    if (document.querySelector('parsererror') || root.localName !== 'svg' || (root.namespaceURI && root.namespaceURI !== namespace)) return '';
    const tags = new Set(['g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','title','desc','defs','marker','linearGradient','radialGradient','stop','clipPath','mask','pattern']);
    const attributes = new Set(['xmlns','id','viewBox','width','height','x','y','x1','y1','x2','y2','cx','cy','r','rx','ry','d','points','transform','fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','opacity','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','dx','dy','rotate','textLength','lengthAdjust','preserveAspectRatio','marker-start','marker-mid','marker-end','markerWidth','markerHeight','refX','refY','orient','markerUnits','gradientUnits','gradientTransform','offset','stop-color','stop-opacity','clip-path','clipPathUnits','mask','maskUnits','maskContentUnits','patternUnits','patternContentUnits','patternTransform','fx','fy','fr']);
    const clean = element => {
        for (const attribute of [...element.attributes]) {
            const value = attribute.value;
            const unsafePaint = /url\s*\(/i.test(value) && !/^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/i.test(value);
            if (!attributes.has(attribute.name) || unsafePaint || /(?:javascript\s*:|expression\s*\(|@import)/i.test(value)) element.removeAttributeNode(attribute);
        }
        for (const child of [...element.childNodes]) {
            if (child.nodeType === 1) {
                if (!tags.has(child.localName) || (child.namespaceURI && child.namespaceURI !== namespace)) child.remove();
                else clean(child);
            } else if (child.nodeType !== 3) child.remove();
        }
    };
    clean(root);
    root.setAttribute('xmlns', namespace);
    if (!root.hasAttribute('viewBox')) {
        const width = Number(root.getAttribute('width')), height = Number(root.getAttribute('height'));
        if (width > 0 && height > 0) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    return new XMLSerializer().serializeToString(root);
}
