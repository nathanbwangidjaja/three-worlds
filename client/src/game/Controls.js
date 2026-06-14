// WASD third-person controls + orbit-follow camera.
import * as THREE from "three";

export class Controls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.keys = new Set();
    this.enabled = true;

    // camera orbit state
    this.yaw = Math.PI;        // around player
    this.pitch = 0.32;         // above horizon
    this.dist = 8.5;

    // player state
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;          // avatar facing
    this.vel = new THREE.Vector3();
    this.vy = 0;               // hop
    this.speed = 0;

    this.WALK = 5.2;
    this.RUN = 11.5;

    this._bind();
  }

  _bind() {
    window.addEventListener("keydown", (e) => {
      if (!this.enabled) return;
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        if (this.pos.y < 0.01) this.vy = 5.2; // hop!
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    // mouse orbit (drag)
    let dragging = false, lx = 0, ly = 0;
    this.dom.addEventListener("pointerdown", (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      this.dom.setPointerCapture(e.pointerId);
    });
    this.dom.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      this.yaw -= (e.clientX - lx) * 0.0052;
      // negative pitch = look UP (see the tops of tall things like the tower)
      this.pitch = Math.max(-1.3, Math.min(1.25, this.pitch + (e.clientY - ly) * 0.004));
      lx = e.clientX; ly = e.clientY;
    });
    this.dom.addEventListener("pointerup", () => (dragging = false));
    this.dom.addEventListener("wheel", (e) => {
      this.dist = Math.max(3.5, Math.min(20, this.dist + e.deltaY * 0.01));
    }, { passive: true });
  }

  // returns horizontal speed for animation
  update(dt, blockedFn, worldRadius) {
    const k = this.keys;
    let fwd = 0, str = 0;
    if (this.enabled) {
      if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) str -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) str += 1;
    }
    const running = k.has("ShiftLeft") || k.has("ShiftRight");
    const target = (fwd || str) ? (running ? this.RUN : this.WALK) : 0;

    // movement direction is camera-relative
    let vx = 0, vz = 0;
    if (target > 0) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // camera forward (towards player look direction)
      const fx = -sin, fz = -cos;
      const rx = cos, rz = -sin;
      let dx = fx * fwd + rx * str;
      let dz = fz * fwd + rz * str;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      vx = dx * target;
      vz = dz * target;
      this.heading = Math.atan2(dx, dz);
    }

    this.speed += (target - this.speed) * Math.min(1, dt * 8);

    // try full move, then axis-slide on collision
    const nx = this.pos.x + vx * dt;
    const nz = this.pos.z + vz * dt;
    const r = worldRadius + 25;
    const inBounds = (x, z) => Math.hypot(x, z) < r;

    if (!blockedFn(nx, nz) && inBounds(nx, nz)) {
      this.pos.x = nx; this.pos.z = nz;
    } else if (!blockedFn(nx, this.pos.z) && inBounds(nx, this.pos.z)) {
      this.pos.x = nx;
    } else if (!blockedFn(this.pos.x, nz) && inBounds(this.pos.x, nz)) {
      this.pos.z = nz;
    }

    // hop physics
    if (this.pos.y > 0 || this.vy !== 0) {
      this.vy -= 18 * dt;
      this.pos.y = Math.max(0, this.pos.y + this.vy * dt);
      if (this.pos.y === 0 && this.vy < 0) this.vy = 0;
    }

    return Math.hypot(vx, vz);
  }

  updateCamera(dt, blockedAtFn, baseY = 0, rayFn = null, focusY = 1.6) {
    const target = new THREE.Vector3(this.pos.x, baseY + this.pos.y + focusY, this.pos.z);
    // Looking UP (pitch < 0): a normal orbit can only tilt the camera higher to
    // look DOWN, so to see tall things (the Eiffel Tower!) we keep the camera
    // roughly level behind the player and raise the AIM point instead — the
    // view then angles skyward by ~|pitch| radians.
    const camPitch = this.pitch < 0 ? 0.04 : this.pitch;
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(this.yaw) * Math.cos(camPitch)
    );

    // shorten the boom if something is in the way (both checks when available:
    // the ray catches walls facing us, the blocked test catches being inside
    // geometry, where rays slip through backfaces)
    let dist = this.dist;
    if (rayFn) {
      const hit = rayFn(target, dir, this.dist + 0.5);
      if (hit !== null) dist = Math.max(1.2, hit - 0.8);
    }
    if (blockedAtFn) {
      for (let d = 1.5; d <= dist; d += 0.75) {
        const px = target.x + dir.x * d;
        const py = target.y + dir.y * d;
        const pz = target.z + dir.z * d;
        if (blockedAtFn(px, pz, py)) { dist = Math.min(dist, Math.max(1.2, d - 1)); break; }
      }
    }
    // boom length: snap IN fast on collision, ease OUT a bit slower to avoid pops
    this.camDist = this.camDist === undefined ? dist : this.camDist + (dist - this.camDist) * Math.min(1, dt * (dist < this.camDist ? 18 : 8));

    const desired = target.clone().addScaledVector(dir, this.camDist);
    desired.y = Math.max(baseY + 0.7, desired.y);
    // follow the orbit snappily so dragging the camera feels responsive (a tiny
    // bit of smoothing remains at high frame rates to stay buttery, not laggy)
    this.camera.position.lerp(desired, Math.min(1, dt * 30));
    // when looking up, raise the look-at point so the view tilts toward the sky
    const lookAt = target.clone();
    if (this.pitch < 0) lookAt.y += Math.tan(-this.pitch) * this.camDist;
    this.camera.lookAt(lookAt);
  }
}
