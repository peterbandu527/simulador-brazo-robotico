import * as THREE from 'three';

const MAT_ARM   = new THREE.MeshStandardMaterial({ color: 0x1a5cbf, metalness: 0.75, roughness: 0.25 });
const MAT_JOINT = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, metalness: 0.9,  roughness: 0.1  });
const MAT_BASE  = new THREE.MeshStandardMaterial({ color: 0x202830, metalness: 0.6,  roughness: 0.4  });
const MAT_GRIP  = new THREE.MeshStandardMaterial({ color: 0xe09010, metalness: 0.65, roughness: 0.3  });

function cylinder(r1, r2, h, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 18), mat.clone());
  m.castShadow = true;
  return m;
}
function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat.clone());
  m.castShadow = true;
  return m;
}
function sphere(r, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), mat.clone());
  m.castShadow = true;
  return m;
}

export class RoboticArm {
  constructor(scene) {
    this.scene = scene;
    this.joints = [];          // Object3D pivots, index 0-5
    this.angles = [0, 0, 0, 0, 0, 0];
    this.gripperOpen = true;
    this._effector = new THREE.Object3D();
    this._effectorPos = new THREE.Vector3();
    this._build();
    this.setHome();
  }

  _build() {
    const s = this.scene;

    // ── Base platform ──────────────────────────────────────────
    const basePlate = box(1.1, 0.12, 1.1, MAT_BASE);
    basePlate.position.set(0, 0.06, 0);
    basePlate.receiveShadow = true;
    s.add(basePlate);

    const baseBody = cylinder(0.22, 0.28, 0.32, MAT_BASE);
    baseBody.position.set(0, 0.28, 0);
    s.add(baseBody);

    // ── J1: base rotation (Y axis) ────────────────────────────
    const j1 = new THREE.Object3D();
    j1.position.set(0, 0.44, 0);
    s.add(j1);
    this.joints[0] = j1;

    const turret = cylinder(0.16, 0.20, 0.28, MAT_ARM);
    turret.position.y = 0.14;
    j1.add(turret);
    j1.add(sphere(0.17, MAT_JOINT));

    // ── J2: shoulder pitch (X axis) ───────────────────────────
    const j2 = new THREE.Object3D();
    j2.position.set(0, 0.28, 0);
    j1.add(j2);
    this.joints[1] = j2;

    // Upper arm (length 1.5, pivot at bottom)
    const upperArm = cylinder(0.085, 0.10, 1.5, MAT_ARM);
    upperArm.position.y = 0.75;
    j2.add(upperArm);

    // ── J3: elbow pitch (X axis) ──────────────────────────────
    const j3 = new THREE.Object3D();
    j3.position.set(0, 1.5, 0);
    j2.add(j3);
    this.joints[2] = j3;

    j3.add(sphere(0.12, MAT_JOINT));

    // Lower arm (length 1.2)
    const lowerArm = cylinder(0.075, 0.088, 1.2, MAT_ARM);
    lowerArm.position.y = 0.6;
    j3.add(lowerArm);

    // ── J4: forearm roll (Z axis) ─────────────────────────────
    const j4 = new THREE.Object3D();
    j4.position.set(0, 1.2, 0);
    j3.add(j4);
    this.joints[3] = j4;

    j4.add(sphere(0.10, MAT_JOINT));

    const wristLink1 = cylinder(0.06, 0.07, 0.38, MAT_ARM);
    wristLink1.position.y = 0.19;
    j4.add(wristLink1);

    // ── J5: wrist pitch (X axis) ──────────────────────────────
    const j5 = new THREE.Object3D();
    j5.position.set(0, 0.38, 0);
    j4.add(j5);
    this.joints[4] = j5;

    j5.add(sphere(0.09, MAT_JOINT));

    const wristLink2 = cylinder(0.052, 0.058, 0.26, MAT_ARM);
    wristLink2.position.y = 0.13;
    j5.add(wristLink2);

    // ── J6: tool rotation (Y axis) ────────────────────────────
    const j6 = new THREE.Object3D();
    j6.position.set(0, 0.26, 0);
    j5.add(j6);
    this.joints[5] = j6;

    // Gripper palm
    const palm = box(0.24, 0.07, 0.14, MAT_GRIP);
    palm.position.y = 0.035;
    j6.add(palm);

    // Fingers
    const fGeo = new THREE.BoxGeometry(0.05, 0.20, 0.055);
    const fMat = MAT_GRIP.clone();
    fMat.color.set(0xc07800);

    this._fingerL = new THREE.Mesh(fGeo, fMat);
    this._fingerL.position.set(-0.085, 0.17, 0);
    this._fingerL.castShadow = true;
    j6.add(this._fingerL);

    this._fingerR = new THREE.Mesh(fGeo, fMat.clone());
    this._fingerR.position.set( 0.085, 0.17, 0);
    this._fingerR.castShadow = true;
    j6.add(this._fingerR);

    // Effector marker (invisible, used for world position)
    this._effector.position.y = 0.30;
    j6.add(this._effector);
  }

  // ── Public API ──────────────────────────────────────────────

  setJointAngle(i, rad) {
    this.angles[i] = rad;
    const axes = ['y', 'x', 'x', 'z', 'x', 'y'];
    this.joints[i].rotation[axes[i]] = rad;
  }

  setJointAngles(arr) {
    arr.forEach((a, i) => this.setJointAngle(i, a));
  }

  setGripper(open) {
    this.gripperOpen = open;
    const spread = open ? 0.085 : 0.038;
    this._fingerL.position.x = -spread;
    this._fingerR.position.x =  spread;
  }

  getEffectorWorldPosition() {
    this._effector.getWorldPosition(this._effectorPos);
    return this._effectorPos;
  }

  setHome() {
    const D = Math.PI / 180;
    this.setJointAngles([0, 20*D, -55*D, 0, 30*D, 0]);
    this.setGripper(true);
  }
}
