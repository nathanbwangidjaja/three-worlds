// Cute low-poly chibi avatars, built from primitives. role: "you" | "her"
import * as THREE from "three";

const LOOKS = {
  you: {
    skin: 0xf0c8a0, hair: 0x2b2118, shirt: 0x3d6fd8, pants: 0x2a2d3a, shoes: 0x44362c,
    hairstyle: "short",
  },
  her: {
    skin: 0xf2cfa8, hair: 0x1f1812, shirt: 0xff7ba6, pants: 0xf3e4d0, shoes: 0xd8d0c8,
    hairstyle: "long",
  },
};

function lambert(color) { return new THREE.MeshLambertMaterial({ color }); }

export class Avatar {
  constructor(role = "you", name = "") {
    const look = LOOKS[role] || LOOKS.you;
    this.role = role;
    this.group = new THREE.Group();
    this.walkPhase = 0;
    this.speedSmooth = 0;
    this.bubbleTimeout = null;

    const body = new THREE.Group();
    this.body = body;
    this.group.add(body);

    // legs
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.24), lambert(look.pants));
    this.legR = this.legL.clone();
    this.legL.position.set(-0.14, 0.25, 0);
    this.legR.position.set(0.14, 0.25, 0);
    // pivot at hip: shift geometry down
    for (const leg of [this.legL, this.legR]) {
      leg.geometry = leg.geometry.clone();
      leg.geometry.translate(0, -0.25, 0);
      leg.position.y = 0.5;
      leg.castShadow = true;
    }
    body.add(this.legL, this.legR);

    // shoes
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.12, 0.34);
    shoeGeo.translate(0, -0.5, 0.04);
    const shoeL = new THREE.Mesh(shoeGeo, lambert(look.shoes));
    const shoeR = shoeL.clone();
    this.legL.add(shoeL);
    this.legR.add(shoeR);

    // torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.34), lambert(look.shirt));
    torso.position.y = 0.8;
    torso.castShadow = true;
    body.add(torso);
    // skirt for her
    if (role === "her") {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, 0.3, 8), lambert(look.shirt));
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
    // hands
    const handGeo = new THREE.SphereGeometry(0.09, 6, 5);
    handGeo.translate(0, -0.48, 0);
    this.armL.add(new THREE.Mesh(handGeo, lambert(look.skin)));
    this.armR.add(new THREE.Mesh(handGeo.clone(), lambert(look.skin)));
    body.add(this.armL, this.armR);

    // head — big and round (chibi!)
    const head = new THREE.Group();
    head.position.y = 1.18;
    this.head = head;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), lambert(look.skin));
    skull.position.y = 0.3;
    skull.castShadow = true;
    head.add(skull);

    // eyes
    for (const ex of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), lambert(0x1a1416));
      eye.position.set(ex, 0.32, 0.3);
      head.add(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), new THREE.MeshLambertMaterial({ color: 0x707070 }));
      shine.position.set(ex + 0.015, 0.345, 0.337);
      head.add(shine);
    }
    // blush
    for (const ex of [-0.2, 0.2]) {
      const blush = new THREE.Mesh(
        new THREE.CircleGeometry(0.05, 8),
        new THREE.MeshBasicMaterial({ color: 0xff9d9d, transparent: true, opacity: 0.55 })
      );
      blush.position.set(ex, 0.24, 0.305);
      blush.lookAt(blush.position.clone().multiplyScalar(2).add(new THREE.Vector3(0, 0.24, 0.8)));
      head.add(blush);
    }

    // hair
    if (look.hairstyle === "short") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.36, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        lambert(look.hair)
      );
      cap.position.y = 0.34;
      head.add(cap);
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), lambert(look.hair));
      fringe.position.set(0, 0.52, 0.26);
      head.add(fringe);
    } else {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
        lambert(look.hair)
      );
      cap.position.y = 0.33;
      head.add(cap);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.75, 0.18), lambert(look.hair));
      back.position.set(0, 0.05, -0.26);
      head.add(back);
      for (const sx of [-1, 1]) {
        const strand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), lambert(look.hair));
        strand.position.set(sx * 0.3, 0.05, 0.02);
        head.add(strand);
      }
    }
    body.add(head);

    // name tag
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
    // word-wrap to ~220px
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

  // speed = horizontal m/s, dt seconds
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
      this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06;
      this.head.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.03;
    } else {
      // idle: gentle breathing
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
  }

  wave(t) { this.waveUntil = t + 1.8; }

  dispose() {
    if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}
