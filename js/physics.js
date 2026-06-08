import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 20;
    this.world.allowSleep = true;

    this._pairs = [];       // { body, mesh } for auto-sync
    this.grabbedBody = null;

    // Named materials for realistic contact behaviour
    this.matBox    = new CANNON.Material('box');
    this.matShelf  = new CANNON.Material('shelf');
    this.matGround = new CANNON.Material('ground');

    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.matBox, this.matShelf, { friction: 0.85, restitution: 0.05 }
    ));
    this.world.addContactMaterial(new CANNON.ContactMaterial(
      this.matBox, this.matGround, { friction: 0.70, restitution: 0.10 }
    ));

    // Ground plane
    const ground = new CANNON.Body({ mass: 0, material: this.matGround });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(ground);
  }

  // Static box (platform, shelf board, etc.) — no mesh sync needed
  addStatic(halfX, halfY, halfZ, px, py, pz, type = 'ground') {
    const body = new CANNON.Body({
      mass: 0,
      material: type === 'shelf' ? this.matShelf : this.matGround,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)));
    body.position.set(px, py, pz);
    this.world.addBody(body);
    return body;
  }

  // Dynamic box — synced to a Three.js mesh each frame
  addDynamic(halfX, halfY, halfZ, px, py, pz, mesh) {
    const body = new CANNON.Body({
      mass: 0.8,
      linearDamping: 0.4,
      angularDamping: 0.8,
      material: this.matBox,
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)));
    body.position.set(px, py, pz);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.2;
    body.sleepTimeLimit = 0.5;
    this.world.addBody(body);
    this._pairs.push({ body, mesh });
    return body;
  }

  grab(body) {
    this.grabbedBody = body;
    body.type = CANNON.Body.KINEMATIC;
    body.velocity.setZero();
    body.angularVelocity.setZero();
  }

  // Snap box to exact position and freeze as static (prevents collision explosion)
  placeAt(body, mesh, x, y, z) {
    if (this.grabbedBody === body) this.grabbedBody = null;
    body.type = CANNON.Body.STATIC;
    body.position.set(x, y, z);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.quaternion.set(0, 0, 0, 1);
    // Sync mesh immediately so no frame of desync
    mesh.position.set(x, y, z);
    mesh.quaternion.set(0, 0, 0, 1);
  }

  release(body) {
    if (this.grabbedBody === body) this.grabbedBody = null;
    body.type = CANNON.Body.DYNAMIC;
    body.velocity.setZero();
    body.wakeUp();
  }

  setGrabbedPosition(x, y, z) {
    if (!this.grabbedBody) return;
    this.grabbedBody.position.set(x, y, z);
    this.grabbedBody.velocity.setZero();
    this.grabbedBody.quaternion.set(0, 0, 0, 1); // keep upright
  }

  step(dt) {
    this.world.step(1 / 60, dt, 3);
  }

  syncMeshes() {
    for (const { body, mesh } of this._pairs) {
      if (body === this.grabbedBody) continue;
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
    }
  }
}
