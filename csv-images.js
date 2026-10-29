// Markdown data images only. Supplied HTML tags are never interpreted.
export function csvMarkdownImage(alt, source, sanitizeSvg) {
    const escape = value => String(value || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(source)) {
        const payload = source.slice(source.indexOf(',') + 1);
        if (payload.length % 4 === 1) return '';
        return `<img class="csv-embedded-image" src="${escape(source)}" alt="${escape(alt || 'Question illustration')}" loading="lazy">`;
    }
    if (!sanitizeSvg) return '';
    const svgSource = source.match(/^data:image\/svg\+xml(?:;(base64))?,(.*)$/i);
    if (!svgSource) return '';
    try {
        const text = svgSource[1]
            ? new TextDecoder().decode(Uint8Array.from(atob(svgSource[2]), char => char.charCodeAt(0)))
            : decodeURIComponent(svgSource[2]);
        const svg = sanitizeSvg(text);
        return svg ? `<span class="svg-token" role="img" aria-label="${escape(alt || 'Question illustration')}">${svg}</span>` : '';
    } catch {
        return '';
    }
}
