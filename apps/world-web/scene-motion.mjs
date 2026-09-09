import { createFramePlayer } from "./scene-frames.mjs";

export function createSceneMotion(root) {
  const doc = root.ownerDocument;
  const media = doc.defaultView.matchMedia("(prefers-reduced-motion: reduce)");
  const actors = new Map();
  let destroyed = false;

  function paused() {
    return doc.hidden || media.matches || doc.body.classList.contains("reduce-motion");
  }

  function synchronize() {
    for (const actor of actors.values()) {
      if (actor.player) {
        if (paused()) {
          if (media.matches || doc.body.classList.contains("reduce-motion")) actor.player.reset();
          else actor.player.pause();
        } else actor.player.play();
      }
      for (const animation of actor.animations) {
        if (paused()) { animation.pause(); if (media.matches || doc.body.classList.contains("reduce-motion")) animation.currentTime = 0; }
        else animation.play();
      }
    }
  }

  function setState(id, element, state, clip = null) {
    if (destroyed) return;
    const previous = actors.get(id);
    const clipKey = JSON.stringify(clip);
    if (previous?.element === element && previous.state === state && previous.clipKey === clipKey) return;
    previous?.animations.forEach(animation => animation.cancel());
    previous?.player?.destroy();
    element.dataset.motionState = state;
    if (clip) {
      actors.set(id, { element, state, clipKey, animations: [], player: createFramePlayer(element, clip) });
      synchronize();
      return;
    }
    const working = state === "working";
    const animation = element.animate([
      { transform: "translateY(0)" },
      { transform: `translateY(${working ? -3 : -1}px)` },
      { transform: "translateY(0)" }
    ], { duration: working ? 1100 : 3000, iterations: Infinity, easing: "steps(3, end)" });
    actors.set(id, { element, state, clipKey, animations: [animation] });
    synchronize();
  }

  const observer = new MutationObserver(synchronize);
  observer.observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  doc.addEventListener("visibilitychange", synchronize);
  media.addEventListener("change", synchronize);
  return {
    setState,
    remove(id) { actors.get(id)?.animations.forEach(animation => animation.cancel()); actors.get(id)?.player?.destroy(); actors.delete(id); },
    destroy() {
      destroyed = true;
      observer.disconnect();
      doc.removeEventListener("visibilitychange", synchronize);
      media.removeEventListener("change", synchronize);
      for (const actor of actors.values()) { actor.animations.forEach(animation => animation.cancel()); actor.player?.destroy(); }
      actors.clear();
    }
  };
}
