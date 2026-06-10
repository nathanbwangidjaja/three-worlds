const el = document.getElementById("dialogue");
const speakerEl = el.querySelector(".speaker");
const textEl = el.querySelector(".text");
const imgEl = el.querySelector("img");
const hintEl = document.getElementById("hint");

let queue = [];
let onDone = null;
let isOpen = false;

export const Dialogue = {
  isOpen() { return isOpen; },

  show(pages, done) {
    // pages: [{ speaker, text, image? }, ...] or just a string
    if (typeof pages === "string") pages = [{ text: pages }];
    queue = [...pages];
    onDone = done || null;
    isOpen = true;
    this.next();
  },

  next() {
    const page = queue.shift();
    if (!page) {
      el.style.display = "none";
      isOpen = false;
      const cb = onDone; onDone = null;
      if (cb) cb();
      return;
    }
    speakerEl.textContent = page.speaker || "";
    speakerEl.style.display = page.speaker ? "block" : "none";
    textEl.textContent = page.text || "";
    if (page.image) {
      imgEl.src = page.image;
      imgEl.style.display = "block";
    } else {
      imgEl.style.display = "none";
      imgEl.src = "";
    }
    el.style.display = "block";
  },

  hide() {
    queue = [];
    onDone = null;
    isOpen = false;
    el.style.display = "none";
    hintEl.style.display = "none";
  },

  showHint(text) {
    if (text) {
      hintEl.innerHTML = text;
      hintEl.style.display = "block";
    } else {
      hintEl.style.display = "none";
    }
  },
};

// Global advance: pressing Space advances dialogue regardless of scene focus
window.addEventListener("keydown", (e) => {
  if (!isOpen) return;
  if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE") {
    e.preventDefault();
    Dialogue.next();
  }
});
