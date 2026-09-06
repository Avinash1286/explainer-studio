import { DOMParser } from "@xmldom/xmldom";

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const tags = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "pattern", "marker", "use", "title", "desc", "text", "tspan"]);
const attributes = new Set("id class version viewBox preserveAspectRatio x y x1 y1 x2 y2 cx cy r rx ry width height d points transform fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color display visibility overflow clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity patternUnits patternContentUnits patternTransform vector-effect font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline dx dy rotate lengthAdjust textLength style href enable-background paint-order marker-start marker-mid marker-end markerUnits markerWidth markerHeight refX refY orient".split(" "));
const cssProperties = new Set("fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color display visibility overflow clip-path clip-rule stop-color stop-opacity font-family font-size font-weight font-style text-anchor dominant-baseline alignment-baseline vector-effect paint-order marker-start marker-mid marker-end".split(" "));

/** Imported files remain standalone SVG images. Only static local geometry is eligible. */
export function inspectAssetSvg(text) {
  if (Buffer.byteLength(text, "utf8") > 2_000_000 || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text) || /<\?(?!xml\s)/i.test(text)) throw new Error("SVG declarations or oversized content are not supported");
  const document = new DOMParser({ onError: (_level, message) => { throw new Error(message); } }).parseFromString(text, "image/svg+xml");
  const root = document.documentElement;
  if (!root || root.localName !== "svg" || root.namespaceURI !== SVG) throw new Error("Expected an SVG document");
  const ids = new Set(), duplicates = new Set(), references = [];
  const checkValue = value => {
    if (/[\\\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || /(?:javascript|vbscript|data|file|https?):\s*|@import|expression\s*\(/i.test(value)) throw new Error("External or active SVG value");
    if (/url\s*\(/i.test(value)) {
      const remaining = value.replace(/url\(\s*["']?#([a-zA-Z0-9_.:-]+)["']?\s*\)/g, (_match, id) => { references.push(id); return ""; });
      if (/url\s*\(/i.test(remaining)) throw new Error("Only local SVG paint references are supported");
    }
  };
  const walk = node => {
    if (node.nodeType === 7 || node.nodeType === 10) throw new Error("SVG processing instructions are not supported");
    if (node.nodeType === 1) {
      if (node.namespaceURI !== SVG || !tags.has(node.localName)) throw new Error(`Unsupported SVG element: ${node.localName}`);
      for (let i = 0; i < node.attributes.length; i++) {
        const attribute = node.attributes.item(i), name = attribute.localName, value = attribute.value;
        if (attribute.namespaceURI === XMLNS) continue;
        if (attribute.namespaceURI && !(attribute.namespaceURI === XLINK && name === "href")) throw new Error("Unsupported SVG attribute namespace");
        if (!attributes.has(name) || /^on/i.test(name)) throw new Error(`Unsupported SVG attribute: ${name}`);
        checkValue(value);
        if (name === "id") { if (!value || value.length > 200) throw new Error("Invalid SVG ID"); if (ids.has(value)) duplicates.add(value); ids.add(value); }
        if (name === "href") { if (!/^#[a-zA-Z0-9_.:-]+$/.test(value)) throw new Error("Only local SVG references are supported"); references.push(value.slice(1)); }
        if (name === "style") for (const declaration of value.split(";").filter(part => part.trim())) {
          const colon = declaration.indexOf(":");
          if (colon < 0 || !cssProperties.has(declaration.slice(0, colon).trim())) throw new Error("Unsupported SVG style property");
        }
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child);
  };
  walk(root);
  if (references.some(id => !ids.has(id) || duplicates.has(id))) throw new Error("SVG references a missing or ambiguous local definition");
  const box = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
  const dimensions = box?.length === 4 ? box.slice(2) : [Number(root.getAttribute("width")), Number(root.getAttribute("height"))];
  if ((box && !box.every(Number.isFinite)) || dimensions.some(value => !Number.isFinite(value) || value <= 0 || value > 32768)) throw new Error("Invalid SVG dimensions");
  return { width: dimensions[0], height: dimensions[1] };
}
