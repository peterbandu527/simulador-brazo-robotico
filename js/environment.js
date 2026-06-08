import * as THREE from 'three';

export class ProceduralEnvironment {
  constructor(scene, warehouse) {
    this.scene = scene;
    this._dustGeo        = null;
    this._dustPositions  = null;
    this._dustVelocities = null;

    this._upgradeFloor();
    this._buildWalls();
    this._buildCeiling();
    this._buildDust();
    this._applyBoxLabels(warehouse);
  }

  update(dt) {
    this._animateDust(dt);
  }

  // ── Floor ─────────────────────────────────────────────────────

  _makeFloorTex() {
    const S   = 256;
    const c   = document.createElement('canvas');
    c.width   = S;
    c.height  = S;
    const ctx = c.getContext('2d');

    // Base
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(0, 0, S, S);

    // Tile grid lines
    ctx.strokeStyle = '#2a3040';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= S; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }

    // Corner rivets
    ctx.fillStyle = '#304050';
    for (let x = 0; x <= S; x += 32)
      for (let y = 0; y <= S; y += 32)
        ctx.fillRect(x - 1, y - 1, 2, 2);

    // Wear scanlines
    for (let y = 0; y < S; y += 4) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`;
      ctx.fillRect(0, y, S, 2);
    }

    const t   = new THREE.CanvasTexture(c);
    t.wrapS   = THREE.RepeatWrapping;
    t.wrapT   = THREE.RepeatWrapping;
    t.repeat.set(6, 6);
    return t;
  }

  _upgradeFloor() {
    const tex = this._makeFloorTex();
    // Find the floor mesh created by scene.js (PlaneGeometry, rotated, at y≈0)
    this.scene.traverse(obj => {
      if (
        obj.isMesh &&
        obj.geometry?.type === 'PlaneGeometry' &&
        obj.rotation.x < -1 &&
        obj.position.y < 0.01
      ) {
        obj.material = new THREE.MeshStandardMaterial({
          map: tex, roughness: 0.9, metalness: 0.1,
        });
      }
    });
  }

  // ── Walls ─────────────────────────────────────────────────────

  _makeWallTex() {
    const W   = 256;
    const H   = 512;
    const c   = document.createElement('canvas');
    c.width   = W;
    c.height  = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#1c2530';
    ctx.fillRect(0, 0, W, H);

    // Corrugated metal bands
    for (let y = 0; y < H; y += 12) {
      ctx.fillStyle = `rgba(255,255,255,${y % 24 === 0 ? 0.10 : 0.04})`;
      ctx.fillRect(0, y, W, 6);
    }

    // Rivets
    ctx.fillStyle = '#3a4f62';
    for (let x = 32; x < W; x += 64)
      for (let y = 24; y < H; y += 48) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

    const t   = new THREE.CanvasTexture(c);
    t.wrapS   = THREE.RepeatWrapping;
    t.wrapT   = THREE.RepeatWrapping;
    t.repeat.set(3, 1.5);
    return t;
  }

  _buildWalls() {
    const tex = this._makeWallTex();
    const mat = () => new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.8, metalness: 0.25,
    });

    // Back wall
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(20, 7), mat());
    bw.position.set(0, 3.5, -5.5);
    this.scene.add(bw);

    // Left wall
    const lw = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), mat());
    lw.position.set(-7, 3.5, 0);
    lw.rotation.y = Math.PI / 2;
    this.scene.add(lw);

    // Right wall
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), mat());
    rw.position.set(7, 3.5, 0);
    rw.rotation.y = -Math.PI / 2;
    this.scene.add(rw);
  }

  // ── Ceiling + industrial beams ────────────────────────────────

  _buildCeiling() {
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x0e1820, roughness: 1, metalness: 0,
    });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 6.2, 0);
    this.scene.add(ceil);

    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x1a2535, metalness: 0.7, roughness: 0.4,
    });
    for (let i = -2; i <= 2; i++) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.38, 14),
        beamMat.clone()
      );
      beam.position.set(i * 3.5, 5.95, 0);
      beam.castShadow = true;
      this.scene.add(beam);
    }
  }

  // ── Box labels ────────────────────────────────────────────────

  _makeBoxLabelTex(id) {
    const S   = 128;
    const c   = document.createElement('canvas');
    c.width   = S;
    c.height  = S;
    const ctx = c.getContext('2d');

    // White label background
    ctx.fillStyle = '#f0ede8';
    ctx.fillRect(0, 0, S, S);

    // Border
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth   = 3;
    ctx.strokeRect(2, 2, S - 4, S - 4);

    // Barcode stripes
    let x = 8;
    while (x < S - 8) {
      const bw = Math.random() < 0.35 ? 3 : 2;
      ctx.fillStyle = Math.random() < 0.5 ? '#111111' : '#f0ede8';
      ctx.fillRect(x, 14, bw, 66);
      x += bw;
    }

    // Text label
    ctx.fillStyle = '#111111';
    ctx.font      = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`BOX-0${id + 1}`, S / 2, 98);

    ctx.font      = 'bold 18px monospace';
    ctx.fillStyle = '#0044bb';
    ctx.fillText(`#${id + 1}`, S / 2, 118);

    return new THREE.CanvasTexture(c);
  }

  _applyBoxLabels(warehouse) {
    warehouse.boxes.forEach((box, i) => {
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        new THREE.MeshBasicMaterial({
          map: this._makeBoxLabelTex(i),
          transparent: true,
        })
      );
      label.position.set(0, 0, 0.215);
      box.mesh.add(label);
    });
  }

  // ── Dust particles ────────────────────────────────────────────

  _buildDust() {
    const COUNT = 80;
    const pos   = new Float32Array(COUNT * 3);
    const vel   = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = Math.random() * 5.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      vel[i * 3]     = (Math.random() - 0.5) * 0.04;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.015;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
    }

    this._dustGeo = new THREE.BufferGeometry();
    this._dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._dustPositions  = pos;
    this._dustVelocities = vel;

    const dust = new THREE.Points(
      this._dustGeo,
      new THREE.PointsMaterial({
        color: 0xc8d0e0,
        size: 0.04,
        transparent: true,
        opacity: 0.32,
        sizeAttenuation: true,
      })
    );
    this.scene.add(dust);
  }

  _animateDust(dt) {
    if (!this._dustPositions) return;
    const p = this._dustPositions;
    const v = this._dustVelocities;
    const n = p.length / 3;

    for (let i = 0; i < n; i++) {
      p[i * 3]     += v[i * 3]     * dt * 60;
      p[i * 3 + 1] += v[i * 3 + 1] * dt * 60;
      p[i * 3 + 2] += v[i * 3 + 2] * dt * 60;

      // Wrap vertically and horizontally
      if (p[i * 3 + 1] > 5.8)  p[i * 3 + 1] = 0.1;
      if (p[i * 3 + 1] < 0)    p[i * 3 + 1] = 5.6;
      if (p[i * 3]     >  8)   p[i * 3]     = -8;
      if (p[i * 3]     < -8)   p[i * 3]     =  8;
    }

    this._dustGeo.attributes.position.needsUpdate = true;
  }
}
