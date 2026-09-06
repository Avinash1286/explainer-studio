// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inspectAssetSvg } from "../scripts/asset-validation.mjs";

const svg = (body: string, attributes = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" ${attributes}>${body}</svg>`;
describe("imported SVG qualification", () => {
  it("preserves intrinsic aspect and supports static local paint definitions", () => {
    expect(inspectAssetSvg(svg('<defs><linearGradient id="color"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="url(#color)" d="M0 0h20v20z"/>'))).toEqual({ width: 200, height: 100 });
    expect(inspectAssetSvg(svg('<g id="unused"/><g id="unused"/><rect width="20" height="20" paint-order="stroke fill"/>'))).toEqual({ width: 200, height: 100 });
  });
  it.each([
    '<script>alert(1)</script>',
    '<foreignObject><div>html</div></foreignObject>',
    '<image href="file:///private/key"/>',
    '<path onclick="alert(1)" d="M0 0"/>',
    '<animate attributeName="x" from="0" to="10"/>',
    '<style>@import url(https://example.com/a.css)</style>',
    '<use href="https://example.com/image.svg#x"/>',
    '<path fill="url(&#104;ttps://example.com/image.svg)"/>',
    '<path style="fill:url(https://example.com/image.svg)"/>',
    '<path style="background-image:url(#a)"/>',
    '<g id="a"/><g id="a"/><use href="#a"/>',
    '<use href="#missing"/>',
    '<g><path></g>',
  ])("rejects unsupported or ambiguous image content: %s", content => {
    expect(() => inspectAssetSvg(svg(content))).toThrow();
  });
  it("rejects document declarations and unusable dimensions", () => {
    expect(() => inspectAssetSvg('<!DOCTYPE svg [<!ENTITY secret SYSTEM "file:///private/key">]>' + svg('<text>&secret;</text>'))).toThrow();
    expect(() => inspectAssetSvg('<?xml-stylesheet href="https://example.com/style"?>' + svg(""))).toThrow();
    expect(() => inspectAssetSvg(svg("").replace("0 0 200 100", "0 0 0 100"))).toThrow();
    expect(() => inspectAssetSvg(svg("").replace("0 0 200 100", "0 0 NaN 100"))).toThrow();
  });
});
