import { expect } from "chai";

import {
  convertImageToArtwork,
  deriveHeight,
  type SourceImage,
} from "./converter";
import { TRANSPARENT_INDEX, validateArtwork } from "./blueprint";

// Palette: 0=black, 1=white, 2=red. Packed 0xRRGGBBAA.
const PALETTE = [0x000000ff, 0xffffffff, 0xff0000ff];

/** Build a solid-color RGBA image. */
function solid(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255
): SourceImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width: w, height: h, data };
}

const base = {
  palette: PALETTE,
  canvasWidth: 64,
  canvasHeight: 64,
  id: "a",
  name: "a",
};

describe("deriveHeight", () => {
  it("scales height by aspect ratio", () => {
    expect(deriveHeight(4, 1, 8)).to.equal(2);
    expect(deriveHeight(1, 1, 8)).to.equal(8);
    expect(deriveHeight(3, 7, 6)).to.equal(14);
  });
  it("never returns 0", () => {
    expect(deriveHeight(100, 1, 4)).to.equal(1);
  });
});

describe("convertImageToArtwork", () => {
  it("square image fills target with no transparent padding", () => {
    const { artwork, targetPixelCount } = convertImageToArtwork(
      solid(8, 8, 255, 0, 0),
      { ...base, targetWidth: 8, fit: "contain" }
    );
    expect(artwork.width).to.equal(8);
    expect(artwork.height).to.equal(8);
    expect(targetPixelCount).to.equal(64);
    expect(artwork.pixels.every((p) => p === 2)).to.equal(true); // red index
  });

  it("wide image contained into square target pads top/bottom transparent", () => {
    const { artwork } = convertImageToArtwork(solid(4, 1, 255, 0, 0), {
      ...base,
      targetWidth: 8,
      targetHeight: 8,
      fit: "contain",
    });
    expect(artwork.width).to.equal(8);
    expect(artwork.height).to.equal(8);
    const row = (y: number) => artwork.pixels.slice(y * 8, y * 8 + 8);
    expect(row(0).every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
    expect(row(7).every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
    expect(row(3).some((p) => p === 2) || row(4).some((p) => p === 2)).to.equal(
      true
    );
  });

  it("tall image contained into square target pads left/right transparent", () => {
    const { artwork } = convertImageToArtwork(solid(1, 4, 255, 0, 0), {
      ...base,
      targetWidth: 8,
      targetHeight: 8,
      fit: "contain",
    });
    const col = (x: number) => artwork.pixels.filter((_, i) => i % 8 === x);
    expect(col(0).every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
    expect(col(7).every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
  });

  it("respects alpha threshold -> transparent cells", () => {
    const { artwork, targetPixelCount } = convertImageToArtwork(
      solid(4, 4, 255, 0, 0, 100),
      { ...base, targetWidth: 4, alphaThreshold: 128 }
    );
    expect(artwork.pixels.every((p) => p === TRANSPARENT_INDEX)).to.equal(true);
    expect(targetPixelCount).to.equal(0);
  });

  it("maps visible pixels to nearest palette color", () => {
    const { artwork } = convertImageToArtwork(solid(2, 2, 250, 250, 250), {
      ...base,
      targetWidth: 2,
    });
    expect(artwork.pixels.every((p) => p === 1)).to.equal(true); // white
  });

  it("clamps oversized target and origin to canvas bounds and validates", () => {
    const { artwork } = convertImageToArtwork(solid(8, 8, 255, 0, 0), {
      ...base,
      canvasWidth: 10,
      canvasHeight: 10,
      targetWidth: 999,
      x: 999,
      y: 999,
    });
    expect(artwork.x + artwork.width).to.be.at.most(10);
    expect(artwork.y + artwork.height).to.be.at.most(10);
    validateArtwork(artwork, 10, 10, PALETTE.length); // throws if invalid
  });
});
