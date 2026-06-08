import * as THREE from 'three';

const PICKUP_X = -3.5;
const SHELF_X  =  3.6;

const BOX_COLORS = {
  green:   0x22cc44,
  red:     0xdd2222,
  grabbed: 0x2080ff,
};

function makeMat(color) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55 });
}
function makeBox(w, h, d, mat, scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

export class WarehouseManager {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.boxes = [];         // { mesh, body, state, id, colorType, _origin }
    this.shelfSlots = [];    // { position: THREE.Vector3, occupied: bool, rackId: number }

    this._buildPickupZone();
    this._buildShelfZone();
    this._spawnBoxes();
  }

  // ── Pickup zone ────────────────────────────────────────────
  _buildPickupZone() {
    const s = this.scene;
    const p = this.physics;

    // Platform
    const platW = 2.4, platH = 0.35, platD = 2.8;
    const platMat = new THREE.MeshStandardMaterial({ color: 0x202830, metalness: 0.5, roughness: 0.6 });
    const plat = makeBox(platW, platH, platD, platMat, s);
    plat.position.set(PICKUP_X, platH / 2, 0);

    p.addStatic(platW/2, platH/2, platD/2, PICKUP_X, platH/2, 0);

    // Warning stripes on platform edge
    for (let i = -1; i <= 1; i++) {
      const stripe = makeBox(platW, 0.01, 0.06, new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xf0c020 : 0x202020 }), s);
      stripe.position.set(PICKUP_X, platH + 0.005, i * 0.25);
    }

    // Label sign
    this._addSign(s, PICKUP_X, 2.6, 0, 'DESCARGA', 0xf0c020);
  }

  // ── Shelf zone ─────────────────────────────────────────────
  _buildShelfZone() {
    this._buildRack(0,   0);   // rack 0 — green → z=0
    this._buildRack(1.8, 1);   // rack 1 — red   → z=+1.8
  }

  _buildRack(zOffset, rackId) {
    const s = this.scene;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a3c50, metalness: 0.75, roughness: 0.3 });
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x182230, metalness: 0.5,  roughness: 0.5 });

    const boardY   = [0.40, 0.85, 1.30, 1.75, 2.20];
    const boardW   = 0.50;
    const boardD   = 0.55;
    const boardCX  = SHELF_X - 0.15;

    for (const y of boardY) {
      const board = makeBox(boardW, 0.06, boardD, boardMat.clone(), s);
      board.position.set(boardCX, y, zOffset);
      board.receiveShadow = true;
    }

    const postH = boardY[boardY.length - 1] + 0.5;
    for (const zOff of [-0.32, 0.32]) {
      for (const xOff of [-0.23, 0.08]) {
        const post = makeBox(0.06, postH, 0.06, frameMat.clone(), s);
        post.position.set(boardCX + xOff, postH / 2, zOffset + zOff);
      }
    }

    // Sign color and label by rack
    const signColor = rackId === 0 ? 0x22cc44 : 0xdd2222;
    const signLabel = rackId === 0 ? 'VERDE'   : 'ROJO';
    this._addSign(s, boardCX, postH + 0.3, zOffset, signLabel, signColor);

    // 5 slots at this rack's z position
    const slotX = boardCX - 0.02;
    for (const y of boardY) {
      this.shelfSlots.push({
        position: new THREE.Vector3(slotX, y + 0.24, zOffset),
        occupied: false,
        rackId,
      });
    }
  }

  _addSign(scene, x, y, z, text, color) {
    // Simple glowing panel (no canvas text needed for demo)
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.35, 0.05),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
    );
    sign.position.set(x, y, z);
    scene.add(sign);
  }

  // ── Boxes ──────────────────────────────────────────────────
  _spawnBoxes() {
    const platTop = 0.35;
    // 3 green boxes stacked at z=-0.55
    for (let i = 0; i < 3; i++) {
      const py = platTop + 0.21 + i * 0.43;
      this._spawnBox(PICKUP_X, py, -0.55, 'green');
    }
    // 2 red boxes stacked at z=+0.55
    for (let i = 0; i < 2; i++) {
      const py = platTop + 0.21 + i * 0.43;
      this._spawnBox(PICKUP_X, py, 0.55, 'red');
    }
  }

  _spawnBox(px, py, pz, colorType) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      makeMat(BOX_COLORS[colorType])
    );
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.position.set(px, py, pz);
    this.scene.add(mesh);

    const body = this.physics.addDynamic(0.21, 0.21, 0.21, px, py, pz, mesh);
    const id   = this.boxes.length;
    this.boxes.push({ mesh, body, state: 'pending', id, colorType, _origin: { x: px, y: py, z: pz } });
  }

  // ── API ─────────────────────────────────────────────────────

  getNextPendingBox() {
    return this.boxes.find(b => b.state === 'pending') || null;
  }

  getNextShelfSlot(rackId = 0) {
    return this.shelfSlots.find(s => s.rackId === rackId && !s.occupied) || null;
  }

  markBoxGrabbed(box) {
    box.state = 'grabbed';
    box.mesh.material.color.set(BOX_COLORS.grabbed);
  }

  markBoxPlaced(box, slot) {
    box.state = 'placed';
    box.mesh.material.color.set(BOX_COLORS[box.colorType]);
    if (slot) slot.occupied = true;
  }

  placedCount() {
    return this.boxes.filter(b => b.state === 'placed').length;
  }

  allPlaced() {
    return this.boxes.every(b => b.state === 'placed');
  }

  resetBoxes() {
    this.boxes.forEach(box => {
      const o = box._origin;
      box.state = 'pending';
      box.mesh.material.color.set(BOX_COLORS[box.colorType]);
      box.body.type = 1;
      box.body.position.set(o.x, o.y, o.z);
      box.body.velocity.setZero();
      box.body.angularVelocity.setZero();
      box.body.quaternion.set(0, 0, 0, 1);
      box.mesh.position.set(o.x, o.y, o.z);
      box.mesh.quaternion.set(0, 0, 0, 1);
      box.body.wakeUp();
    });
    this.shelfSlots.forEach(s => s.occupied = false);
  }
}
