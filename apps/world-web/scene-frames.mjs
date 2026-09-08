export function createFramePlayer(host, clip) {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  const images = new Map([...host.querySelectorAll("img[data-asset-id]")].map(image => [image.dataset.assetId, image]));
  const original = new Map([...images].map(([id, image]) => [id, image.getAttribute("src")]));
  let request = null;
  let elapsed = 0;
  let previous = null;
  let frame = -1;
  let disposed = false;
  let finished = false;

  function paint(index) {
    if (index === frame) return;
    frame = index;
    for (const { id, clip: layer } of clip.layers) {
      const image = images.get(id);
      if (image) image.src = layer.frames[index];
    }
  }
  function tick(now) {
    request = null;
    if (disposed || finished) return;
    if (previous !== null) elapsed += now - previous;
    previous = now;
    const step = Math.floor(elapsed * clip.fps / 1000);
    paint(clip.loop ? step % clip.frames : Math.min(step, clip.frames - 1));
    finished = !clip.loop && step >= clip.frames - 1;
    if (!finished) request = view.requestAnimationFrame(tick);
  }
  function pause() {
    if (request !== null) view.cancelAnimationFrame(request);
    request = null;
    previous = null;
  }
  paint(0);
  return {
    play() { if (!disposed && !finished && request === null) request = view.requestAnimationFrame(tick); },
    pause,
    reset() { pause(); elapsed = 0; finished = false; paint(0); },
    destroy() {
      pause(); disposed = true;
      for (const [id, src] of original) if (src !== null) images.get(id)?.setAttribute("src", src);
    }
  };
}
