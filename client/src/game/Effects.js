// Floating hearts, sparkles, kisses, and fireworks.
import * as THREE from "three";

function emojiTexture(emoji, size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.font = `${size * 0.8}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const TEXTURES = {};
function getTexture(emoji) {
  if (!TEXTURES[emoji]) TEXTURES[emoji] = emojiTexture(emoji);
  return TEXTURES[emoji];
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.live = [];      // {sprite, vel, spin, life, ttl}
    this.fireworks = []; // {points, vels, life, ttl, mat}
  }

  // a burst of emoji sprites rising from a world position
  emote(pos, kind) {
    const emojiMap = {
      heart: ["❤️", "💕", "💖", "💗"],
      wave: ["👋"],
      sparkle: ["✨", "⭐", "💫"],
      kiss: ["😘", "💋", "❤️"],
    };
    const set = emojiMap[kind] || ["❤️"];
    const count = kind === "wave" ? 1 : 7;
    for (let i = 0; i < count; i++) {
      const emoji = set[Math.floor(Math.random() * set.length)];
      const mat = new THREE.SpriteMaterial({
        map: getTexture(emoji), transparent: true, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const s = 0.5 + Math.random() * 0.35;
      sprite.scale.set(s, s, 1);
      sprite.position.set(
        pos.x + (Math.random() - 0.5) * 0.8,
        pos.y + 2.1 + Math.random() * 0.4,
        pos.z + (Math.random() - 0.5) * 0.8
      );
      this.scene.add(sprite);
      this.live.push({
        sprite,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.7, 1.3 + Math.random() * 0.9, (Math.random() - 0.5) * 0.7),
        life: 0,
        ttl: 1.6 + Math.random() * 0.9,
      });
    }
  }

  firework(center) {
    const colors = [0xff6b9d, 0xffd76b, 0x7bdcff, 0xc77bff, 0xff9d6b, 0x8dffb0];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const N = 130;
    const pos = new Float32Array(N * 3);
    const vels = [];
    const origin = new THREE.Vector3(
      center.x + (Math.random() - 0.5) * 160,
      90 + Math.random() * 110,
      center.z + (Math.random() - 0.5) * 160
    );
    for (let i = 0; i < N; i++) {
      pos.set([origin.x, origin.y, origin.z], i * 3);
      // random point on sphere
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const speed = 14 + Math.random() * 14;
      vels.push(new THREE.Vector3(r * Math.cos(th) * speed, u * speed, r * Math.sin(th) * speed));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 1.7, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.fireworks.push({ points, vels, mat, life: 0, ttl: 2.4 });
  }

  update(dt) {
    // emoji sprites
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.life += dt;
      e.sprite.position.addScaledVector(e.vel, dt);
      e.vel.y -= 0.4 * dt;
      const k = e.life / e.ttl;
      e.sprite.material.opacity = 1 - k * k;
      if (e.life >= e.ttl) {
        this.scene.remove(e.sprite);
        e.sprite.material.dispose();
        this.live.splice(i, 1);
      }
    }
    // fireworks
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const f = this.fireworks[i];
      f.life += dt;
      const posAttr = f.points.geometry.attributes.position;
      for (let p = 0; p < f.vels.length; p++) {
        const v = f.vels[p];
        v.y -= 9 * dt;
        v.multiplyScalar(1 - dt * 0.9);
        posAttr.setXYZ(p, posAttr.getX(p) + v.x * dt, posAttr.getY(p) + v.y * dt, posAttr.getZ(p) + v.z * dt);
      }
      posAttr.needsUpdate = true;
      f.mat.opacity = Math.max(0, 1 - (f.life / f.ttl) ** 1.5);
      if (f.life >= f.ttl) {
        this.scene.remove(f.points);
        f.points.geometry.dispose();
        f.mat.dispose();
        this.fireworks.splice(i, 1);
      }
    }
  }

  clear() {
    for (const e of this.live) { this.scene.remove(e.sprite); e.sprite.material.dispose(); }
    for (const f of this.fireworks) { this.scene.remove(f.points); f.points.geometry.dispose(); f.mat.dispose(); }
    this.live = [];
    this.fireworks = [];
  }
}
