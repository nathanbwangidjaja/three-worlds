// Chibi avatars — modeled on the real couple, with outfits from their
// actual wardrobe, plus randomizable looks for NPCs so a restaurant
// doesn't feel like a hall of clones.
import * as THREE from "three";

// ---- the two of them ----
const BASE = {
  you: {
    skin: 0xe8c19c, hair: 0x18120e, hairstyle: "short",
  },
  her: {
    skin: 0xf2d8bc, hair: 0x251a11, hairstyle: "long",
  },
};

// outfits photographed from real life
export const OUTFITS = {
  you: [
    { label: "white shirt 👔", shirt: 0xf2efe8, pants: 0x1d1d22, shoes: 0xeeeeee, collar: 0xf2efe8 },
    { label: "beige jacket 🧥", shirt: 0xccb795, pants: 0x1d1d22, shoes: 0xeeeeee, collar: 0x33281e },
    { label: "grey hoodie 🥷", shirt: 0xd6d6d8, pants: 0x232327, shoes: 0xeeeeee, hood: true },
  ],
  her: [
    { label: "black top + satin 🤍", shirt: 0x211e20, pants: 0xe6d7b8, shoes: 0xf0f0f0 },
    { label: "brown blazer 🤎", shirt: 0x6e4f38, pants: 0x1d1d22, shoes: 0xf0f0f0 },
    { label: "white skirt 🌸", shirt: 0x211e20, pants: 0xf0e9da, shoes: 0xf0f0f0, skirt: 0xf0e9da },
  ],
};

function lambert(color) { return new THREE.MeshLambertMaterial({ color }); }

// ---- drawn faces (Animal-Crossing-style detail, not photos) ----
// face: { eyes: 'soft'|'sharp'|'round', lashes, browTilt, mouth: 'smile'|'soft'|'grin',
//         blush, lipTint, stubble, glasses, skin, hair }
function drawFaceTexture(face, closed = false) {
  const W = 256, H = 192;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // skin base (matches the skull so the patch blends seamlessly)
  const skin = "#" + new THREE.Color(face.skin).getHexString();
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, W, H);
  // soft cheek/forehead shading
  const sh = ctx.createRadialGradient(W / 2, H * 0.42, 30, W / 2, H * 0.5, 150);
  sh.addColorStop(0, "rgba(255,255,255,0.10)");
  sh.addColorStop(1, "rgba(120,70,40,0.08)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, W, H);

  const browC = "#" + new THREE.Color(face.hair).clone().multiplyScalar(0.85).getHexString();
  const eyeY = H * 0.54, eyeDX = W * 0.185;
  const ex = [W / 2 - eyeDX, W / 2 + eyeDX];

  // eyebrows
  ctx.strokeStyle = browC;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(ex[i] - s * 22, eyeY - 34 + face.browTilt * 6);
    ctx.quadraticCurveTo(ex[i], eyeY - 42 - face.browTilt * 4, ex[i] + s * 22, eyeY - 32);
    ctx.stroke();
  }

  // eyes
  for (let i = 0; i < 2; i++) {
    if (closed) {
      ctx.strokeStyle = "#241a16";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(ex[i], eyeY - 2, 14, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      continue;
    }
    // eye shape
    ctx.fillStyle = "#241a16";
    ctx.beginPath();
    if (face.eyes === "sharp") {
      ctx.ellipse(ex[i], eyeY, 13, 15, 0, 0, Math.PI * 2);
    } else if (face.eyes === "round") {
      ctx.ellipse(ex[i], eyeY, 14, 14, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(ex[i], eyeY, 13, 16, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    // iris warmth
    ctx.fillStyle = "rgba(120,70,30,0.45)";
    ctx.beginPath();
    ctx.ellipse(ex[i], eyeY + 4, 9, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // highlights — this is what makes eyes feel alive
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(ex[i] - 4, eyeY - 6, 4.4, 4.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(ex[i] + 5, eyeY + 6, 2.2, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // lashes
    if (face.lashes) {
      ctx.strokeStyle = "#241a16";
      ctx.lineWidth = 3.4;
      const s = i === 0 ? -1 : 1;
      for (const [dx, dy, ang] of [[s * 12, -10, -0.5], [s * 15, -3, -0.15], [s * 15, 4, 0.25]]) {
        ctx.beginPath();
        ctx.moveTo(ex[i] + dx, eyeY + dy);
        ctx.lineTo(ex[i] + dx + s * 7 * Math.cos(ang), eyeY + dy + 7 * Math.sin(ang) - 3);
        ctx.stroke();
      }
    }
  }

  // glasses
  if (face.glasses) {
    ctx.strokeStyle = "rgba(30,28,30,0.9)";
    ctx.lineWidth = 4.5;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.roundRect(ex[i] - 21, eyeY - 19, 42, 36, 10);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(ex[0] + 21, eyeY - 6);
    ctx.lineTo(ex[1] - 21, eyeY - 6);
    ctx.stroke();
  }

  // nose: a soft little shadow
  ctx.strokeStyle = "rgba(120,70,40,0.5)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.7, 7, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  // mouth
  const my = H * 0.85;
  ctx.lineCap = "round";
  if (face.mouth === "grin") {
    ctx.fillStyle = face.lipTint ? "#b3585e" : "#7a4038";
    ctx.beginPath();
    ctx.arc(W / 2, my - 3, 16, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(W / 2 - 10, my - 2, 20, 4);
  } else {
    ctx.strokeStyle = face.lipTint ? "#b3585e" : "rgba(90,45,35,0.85)";
    ctx.lineWidth = face.mouth === "soft" ? 4.5 : 5.5;
    ctx.beginPath();
    ctx.arc(W / 2, my - 8, face.mouth === "soft" ? 12 : 15, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
  }

  // blush
  if (face.blush) {
    ctx.fillStyle = "rgba(235,140,135,0.4)";
    for (const bx of [W / 2 - W * 0.31, W / 2 + W * 0.31]) {
      ctx.beginPath();
      ctx.ellipse(bx, H * 0.7, 17, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // stubble
  if (face.stubble) {
    ctx.fillStyle = "rgba(50,40,34,0.30)";
    for (let i = 0; i < 90; i++) {
      const a = Math.random();
      const x = W / 2 + (a - 0.5) * W * 0.5;
      const y = H * 0.8 + Math.random() * H * 0.16 - Math.abs(a - 0.5) * 18;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Avatar {
  // opts: { outfit: index into OUTFITS[role], npcLook: {skin,hair,shirt,pants,shoes,hairstyle,scale} }
  constructor(role = "you", name = "", opts = {}) {
    const base = BASE[role] || BASE.you;
    const outfit = OUTFITS[role]?.[opts.outfit ?? 0] ?? OUTFITS.you[0];
    const look = {
      skin: base.skin, hair: base.hair, hairstyle: base.hairstyle,
      shirt: outfit.shirt, pants: outfit.pants, shoes: outfit.shoes,
      collar: outfit.collar, hood: outfit.hood, skirt: outfit.skirt,
      scale: 1,
      ...(opts.npcLook || {}),
    };
    this.role = role;
    this.group = new THREE.Group();
    this.walkPhase = 0;
    this.speedSmooth = 0;
    this.bubbleTimeout = null;

    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);
    if (look.scale !== 1) this.group.scale.setScalar(look.scale);

    // legs
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.24), lambert(look.pants));
    this.legR = this.legL.clone();
    this.legL.position.set(-0.14, 0.25, 0);
    this.legR.position.set(0.14, 0.25, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.geometry = leg.geometry.clone();
      leg.geometry.translate(0, -0.25, 0);
      leg.position.y = 0.5;
      leg.castShadow = true;
    }
    body.add(this.legL, this.legR);

    // shoes
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.12, 0.34);
    shoeGeo.translate(0, -0.47, 0.04);
    const shoeL = new THREE.Mesh(shoeGeo, lambert(look.shoes));
    const shoeR = shoeL.clone();
    this.legL.add(shoeL);
    this.legR.add(shoeR);

    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.34), lambert(look.shirt));
    torso.position.y = 0.8;
    torso.castShadow = true;
    body.add(torso);

    // collar accent (his jackets) — a thin band at the neckline
    if (look.collar && look.collar !== look.shirt) {
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.09, 0.36), lambert(look.collar));
      collar.position.y = 1.07;
      body.add(collar);
    }
    // hoodie hood resting on the back
    if (look.hood) {
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.14), lambert(look.shirt));
      hood.position.set(0, 1.04, -0.22);
      body.add(hood);
    }
    // skirt
    if (look.skirt) {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.4, 0.32, 8), lambert(look.skirt));
      skirt.position.y = 0.52;
      body.add(skirt);
    }

    // arms (pivot at shoulder)
    const armGeo = new THREE.BoxGeometry(0.16, 0.5, 0.18);
    armGeo.translate(0, -0.22, 0);
    this.armL = new THREE.Mesh(armGeo, lambert(look.shirt));
    this.armR = this.armL.clone();
    this.armL.position.set(-0.37, 1.04, 0);
    this.armR.position.set(0.37, 1.04, 0);
    this.armL.castShadow = this.armR.castShadow = true;
    const handGeo = new THREE.SphereGeometry(0.09, 6, 5);
    handGeo.translate(0, -0.48, 0);
    this.armL.add(new THREE.Mesh(handGeo, lambert(look.skin)));
    this.armR.add(new THREE.Mesh(handGeo.clone(), lambert(look.skin)));
    body.add(this.armL, this.armR);

    // head
    const head = new THREE.Group();
    head.position.y = 1.18;
    this.head = head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), lambert(look.skin));
    skull.position.y = 0.3;
    skull.castShadow = true;
    head.add(skull);

    // drawn face on a curved patch that hugs the skull
    const fem = look.hairstyle === "long" || look.hairstyle === "bun";
    const facePreset = role === "her"
      ? { eyes: "soft", lashes: true, browTilt: 0, mouth: "smile", blush: true, lipTint: true }
      : { eyes: "sharp", lashes: false, browTilt: 0.5, mouth: "soft", blush: false, lipTint: false };
    const face = {
      skin: look.skin, hair: look.hair,
      ...facePreset,
      ...(opts.npcLook ? { lashes: fem, blush: fem, lipTint: fem } : {}),
      ...(look.face || {}),
    };
    this.faceOpen = drawFaceTexture(face, false);
    this.faceClosed = drawFaceTexture(face, true);
    const phiLen = 1.7;
    const patchGeo = new THREE.SphereGeometry(
      0.346, 20, 14, Math.PI / 2 - phiLen / 2, phiLen, 0.95, 1.25
    );
    this.faceMat = new THREE.MeshLambertMaterial({ map: this.faceOpen });
    const facePatch = new THREE.Mesh(patchGeo, this.faceMat);
    facePatch.position.y = 0.3;
    head.add(facePatch);

    // ears
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), lambert(look.skin));
      ear.position.set(sx * 0.33, 0.3, 0);
      head.add(ear);
    }

    // hair styles
    const hairM = lambert(look.hair);
    if (look.hairstyle === "short") {
      // his: short black hair, a little volume up top and a soft fringe
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.365, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
        hairM
      );
      cap.position.y = 0.36;
      head.add(cap);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.3), hairM);
      top.position.set(0, 0.62, 0.02);
      head.add(top);
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.1), hairM);
      fringe.position.set(0, 0.53, 0.26);
      fringe.rotation.x = 0.25;
      head.add(fringe);
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.22), hairM);
      sideL.position.set(-0.32, 0.4, 0.05);
      head.add(sideL);
      head.add((() => { const s = sideL.clone(); s.position.x = 0.32; return s; })());
    } else if (look.hairstyle === "bun") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
        hairM
      );
      cap.position.y = 0.34;
      head.add(cap);
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), hairM);
      bun.position.set(0, 0.6, -0.24);
      head.add(bun);
    } else if (look.hairstyle === "buzz") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.345, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        hairM
      );
      cap.position.y = 0.33;
      head.add(cap);
    } else {
      // her: long dark hair — one connected shape: crown cap high enough to
      // show her eyes, side curtains hugging the head, full back panel
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.375, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
        hairM
      );
      cap.position.y = 0.33;
      head.add(cap);
      // rear hemisphere drops lower so there's no bald gap above the back panel
      const backCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.372, 14, 10, Math.PI, Math.PI, 0, Math.PI * 0.72),
        hairM
      );
      backCap.position.y = 0.31;
      head.add(backCap);
      // side curtains overlap the cap edge and fall past the shoulders
      for (const sx of [-1, 1]) {
        const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.98, 0.32), hairM);
        curtain.position.set(sx * 0.295, -0.02, -0.03);
        curtain.rotation.z = -sx * 0.05;
        head.add(curtain);
      }
      // back panel connects the curtains
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.98, 0.15), hairM);
      back.position.set(0, -0.02, -0.245);
      head.add(back);
      // soft middle-part fringe pieces, flush against the forehead
      for (const sx of [-1, 1]) {
        const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.07), hairM);
        fringe.position.set(sx * 0.17, 0.5, 0.265);
        fringe.rotation.z = -sx * 0.42;
        head.add(fringe);
      }
    }
    body.add(head);

    if (name) this.setName(name);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  setName(name) {
    if (this.nameSprite) {
      this.group.remove(this.nameSprite);
      this.nameSprite.material.map.dispose();
      this.nameSprite.material.dispose();
    }
    const canvas = document.createElement("canvas");
    const font = "600 30px 'Avenir Next', system-ui";
    const ctx = canvas.getContext("2d");
    ctx.font = font;
    const heartIcon = this.role === "her" ? "🩷 " : "💙 ";
    const text = heartIcon + name;
    const w = Math.ceil(ctx.measureText(text).width) + 26;
    const h = 48;
    canvas.width = w * 2; canvas.height = h * 2;
    const c = canvas.getContext("2d");
    c.scale(2, 2);
    c.font = font;
    c.fillStyle = "rgba(12,7,15,0.55)";
    c.beginPath(); c.roundRect(0, 0, w, h, 12); c.fill();
    c.fillStyle = "#fff4ea";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(text, w / 2, h / 2 + 1);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    const s = 0.011;
    sprite.scale.set(w * s, h * s, 1);
    sprite.position.y = 2.25;
    this.nameSprite = sprite;
    this.group.add(sprite);
  }

  say(text) {
    if (this.bubble) {
      this.group.remove(this.bubble);
      this.bubble.material.map.dispose();
      this.bubble.material.dispose();
      this.bubble = null;
    }
    if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);

    const font = "500 26px 'Avenir Next', system-ui";
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = font;
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const wd of words) {
      const tryLine = line ? line + " " + wd : wd;
      if (measure.measureText(tryLine).width > 230 && line) { lines.push(line); line = wd; }
      else line = tryLine;
    }
    if (line) lines.push(line);
    const w = Math.min(260, Math.max(...lines.map((l) => measure.measureText(l).width)) + 30);
    const lh = 32;
    const h = lines.length * lh + 22;

    const canvas = document.createElement("canvas");
    canvas.width = w * 2; canvas.height = h * 2;
    const c = canvas.getContext("2d");
    c.scale(2, 2);
    c.fillStyle = "rgba(255,248,240,0.94)";
    c.beginPath(); c.roundRect(0, 0, w, h, 14); c.fill();
    c.font = font;
    c.fillStyle = "#3a2433";
    c.textAlign = "center"; c.textBaseline = "middle";
    lines.forEach((l, i) => c.fillText(l, w / 2, 16 + i * lh + lh / 2 - 5));

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    const s = 0.011;
    sprite.scale.set(w * s, h * s, 1);
    sprite.position.y = 2.6 + (h * s) / 2;
    this.bubble = sprite;
    this.group.add(sprite);

    this.bubbleTimeout = setTimeout(() => {
      if (this.bubble) {
        this.group.remove(this.bubble);
        this.bubble.material.map.dispose();
        this.bubble.material.dispose();
        this.bubble = null;
      }
    }, 5200);
  }

  animate(dt, speed, t) {
    this.speedSmooth += (speed - this.speedSmooth) * Math.min(1, dt * 10);
    const s = this.speedSmooth;

    if (s > 0.3) {
      this.walkPhase += dt * (5 + s * 1.6);
      const swing = Math.min(0.85, 0.35 + s * 0.07);
      this.legL.rotation.x = Math.sin(this.walkPhase) * swing;
      this.legR.rotation.x = -Math.sin(this.walkPhase) * swing;
      this.armL.rotation.x = -Math.sin(this.walkPhase) * swing * 0.8;
      this.armR.rotation.x = Math.sin(this.walkPhase) * swing * 0.8;
      // lift with the stride so feet plant on the surface instead of under it
      this.body.position.y = 0.05 + Math.abs(Math.sin(this.walkPhase)) * 0.06;
      this.head.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.03;
    } else {
      const damp = Math.min(1, dt * 8);
      this.legL.rotation.x += -this.legL.rotation.x * damp;
      this.legR.rotation.x += -this.legR.rotation.x * damp;
      this.armL.rotation.x += -this.armL.rotation.x * damp;
      this.armR.rotation.x += -this.armR.rotation.x * damp;
      this.body.position.y = Math.sin(t * 2.1) * 0.015;
      this.armL.rotation.z = Math.sin(t * 2.1) * 0.03 + 0.05;
      this.armR.rotation.z = -Math.sin(t * 2.1) * 0.03 - 0.05;
    }

    if (this.waveUntil && t < this.waveUntil) {
      this.armR.rotation.z = -2.6 + Math.sin(t * 12) * 0.45;
    } else if (this.waveUntil) {
      this.waveUntil = 0;
      this.armR.rotation.z = 0;
    }

    // blinking
    if (this.faceMat) {
      if (this._blinkAt === undefined) this._blinkAt = t + 1.5 + Math.random() * 3;
      if (t > this._blinkAt + 0.13) {
        if (this.faceMat.map !== this.faceOpen) this.faceMat.map = this.faceOpen;
        this._blinkAt = t + 2.2 + Math.random() * 3.6;
      } else if (t > this._blinkAt && this.faceMat.map !== this.faceClosed) {
        this.faceMat.map = this.faceClosed;
      }
    }
  }

  wave(t) { this.waveUntil = t + 1.8; }

  dispose() {
    if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);
    this.faceOpen?.dispose();
    this.faceClosed?.dispose();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}

// a believable stranger: random skin/hair/outfit/height
export function randomNpcLook(rng) {
  const skins = [0xf2d8bc, 0xe8c19c, 0xd9a877, 0xc08850, 0x8d5a33, 0x6b4226];
  const hairs = [0x18120e, 0x251a11, 0x3a2a18, 0x584026, 0x1f1f24, 0x6e6258, 0x9a8a76];
  const shirts = [0x6a4a5e, 0x3a5a4a, 0x46506e, 0x7a5a36, 0x555a44, 0x8a3a3e, 0x2e4a66, 0x9a8a6a];
  const pantsC = [0x1d1d22, 0x32383e, 0x4a4038, 0x5a5e66, 0x6e6256];
  const styles = ["short", "long", "bun", "buzz"];
  const hairstyle = styles[Math.floor(rng() * styles.length)];
  const fem = hairstyle === "long" || hairstyle === "bun";
  return {
    skin: skins[Math.floor(rng() * skins.length)],
    hair: hairs[Math.floor(rng() * hairs.length)],
    shirt: shirts[Math.floor(rng() * shirts.length)],
    pants: pantsC[Math.floor(rng() * pantsC.length)],
    shoes: [0xeeeeee, 0x2a2a2e, 0x6e5a44][Math.floor(rng() * 3)],
    hairstyle,
    scale: 0.92 + rng() * 0.16,
    face: {
      eyes: ["soft", "sharp", "round"][Math.floor(rng() * 3)],
      browTilt: rng() * 1.2 - 0.3,
      mouth: ["smile", "soft", "grin"][Math.floor(rng() * 3)],
      lashes: fem,
      blush: fem && rng() < 0.5,
      lipTint: fem && rng() < 0.5,
      stubble: !fem && rng() < 0.3,
      glasses: rng() < 0.18,
    },
  };
}
