// Encodes the terrain grid as PNG off the page, so autosave and save don't freeze
// the screen (a big map has tens of millions of pixels). Same image as encodeGrid.
import { gridPixels } from '../map/project.js';

onmessage = async ({ data: { id, w, h, grid } }) => {
  try {
    const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d'), im = ctx.createImageData(w, h);
    gridPixels(new Uint8Array(grid), im.data);
    ctx.putImageData(im, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' });
    postMessage({ id, url: new FileReaderSync().readAsDataURL(blob) });
  } catch (err) {
    postMessage({ id, error: String(err) });
  }
};
