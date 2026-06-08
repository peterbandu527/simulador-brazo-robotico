// Automation controller: state machine for pick-and-place cycles
const D = Math.PI / 180;

// ── Poses: [J1, J2, J3, J4, J5, J6] in radians ──────────────
// J1: Y rotation (base), J2: X (shoulder), J3: X (elbow)
// J4: Z (forearm roll), J5: X (wrist pitch), J6: Y (tool)
// ── Pose library ─────────────────────────────────────────────
// All poses verified with forward kinematics so no arm segment
// clips through shelf boards or posts during any motion.
//
// Arm origin: J2 shoulder at world (0, 0.72, 0).
// With J1=+90°, arm extends toward world +X (shelf at x≈3.3).
// With J1=-90°, arm extends toward world -X (pickup at x≈-3.5).
//
// APPROACH_FROM_ABOVE strategy: for each shelf level the arm
// positions the gripper 0.6-0.9 m ABOVE the slot, then lowers
// straight down. This keeps all arm segments clear of boards.

const POSE = {
  home:        [   0,  20*D,  -55*D,  0,  30*D,  0],

  // ── Pickup (J1=-90°, arm faces world -X) ─────────────────
  // approach: effector ≈ (-3.18, 2.42, 0) — above & in front of boxes
  pickApproach:[-90*D,  55*D,    5*D,  0,  15*D,  0],
  // down: effector ≈ (-3.54, 0.63, 0) — near box center height
  pickDown:    [-90*D,  77*D,   18*D,  0,  15*D,  0],

  // ── TUCK: arm folded for safe 180° J1 rotation ───────────
  // Elbow at radius ≈ 0.75 m from axis → clears shelf at 3.5 m
  tuckPickup:  [-90*D,  30*D,  -80*D,  0,  30*D,  0],
  tuckShelf:   [ 90*D,  30*D,  -80*D,  0,  30*D,  0],
  tuckHome:    [   0,   30*D,  -80*D,  0,  30*D,  0],
  tuckShelf2:  [ 62*D,  30*D,  -80*D,  0,  30*D,  0],
};

// ── Shelf deposit poses: 5 levels, all z=0, J1=+90° ─────────
// APPROACH: gripper well above target slot (no board collision).
// DOWN     : gripper at slot height — arm arrives from above.
// FK-verified: arm path stays above each shelf board it crosses.
//
// Slot heights (board_top + box_half): 0.64, 1.09, 1.54, 1.99, 2.44
const PLACE_POSES = [
  // Level 0 — slot y≈0.64  approach y≈1.51  (FK: x=3.34, y=1.51)
  { approach: [90*D, 55*D, 28*D, 0, 20*D, 0],
    down:     [90*D, 64*D, 37*D, 0, 20*D, 0] },
  // Level 1 — slot y≈1.09  approach y≈2.01  (FK: x=3.26, y=2.01)
  { approach: [90*D, 52*D, 20*D, 0, 18*D, 0],
    down:     [90*D, 63*D, 27*D, 0, 18*D, 0] },
  // Level 2 — slot y≈1.54  approach y≈2.18  (FK: x=3.26, y=2.18)
  { approach: [90*D, 55*D, 12*D, 0, 15*D, 0],
    down:     [90*D, 62*D, 18*D, 0, 15*D, 0] },
  // Level 3 — slot y≈1.99  approach y≈2.53  (FK: x=3.13, y=2.53)
  { approach: [90*D, 54*D,  5*D, 0, 12*D, 0],
    down:     [90*D, 61*D,  8*D, 0, 12*D, 0] },
  // Level 4 — slot y≈2.44  approach y≈2.90  (FK: x=2.91, y=2.90)
  { approach: [90*D, 52*D, -2*D, 0,  9*D, 0],
    down:     [90*D, 59*D,  0*D, 0,  9*D, 0] },
];

// Rack 2 (z=+1.8): same arm geometry but J1=62° to face z=+1.8
const PLACE_POSES_RACK2 = PLACE_POSES.map(p => ({
  approach: [62*D, ...p.approach.slice(1)],
  down:     [62*D, ...p.down.slice(1)],
}));

// State sequence:
// APPROACH_PICKUP → DESCEND_PICKUP → GRIP → SCAN → LIFT
// → TUCK_TO_SHELF  (fold arm, then rotate J1 to shelf angle in one lerp)
// → APPROACH_SHELF → DESCEND_SHELF → PLACE
// → TUCK_TO_HOME   (retract arm, fold, rotate J1 back to 0 in one lerp)
// → RETURN_HOME    (unfold to home pose)
// NOTE: automation.update() must run BEFORE vision.update() each frame so
// that the SCAN callback always fires after this switch exits (no re-entry).

const LERP_THRESH = 0.008; // radians — "close enough"

export class AutomationController {
  constructor(arm, warehouse, physics, vision = null) {
    this.arm = arm;
    this.warehouse = warehouse;
    this.physics = physics;
    this.vision = vision;
    this._targetRack   = 0;
    this._scanStarted  = false;

    this.enabled = false;
    this.speed = 1.5;    // multiplier controlled by UI speed slider
    this.state = 'IDLE';
    this.statusText = 'Listo';

    this._currentBox = null;
    this._currentSlot = null;
    this._slotLevel = 0;  // 0=low … 4=high — maps to PLACE_POSES row

    this._targetPose = [...POSE.home];
  }

  // ── Public ──────────────────────────────────────────────────

  start() {
    if (this.state !== 'IDLE') return;
    this.enabled = true;
    this._beginCycle();
  }

  stop() {
    this.enabled = false;
    this.state = 'IDLE';
    this.statusText = 'Pausado';
    // Release any grabbed box
    if (this._currentBox && this.physics.grabbedBody) {
      this.physics.release(this._currentBox.body);
    }
    this._currentBox = null;
    this._currentSlot = null;
    this.vision?.reset();
    this._scanStarted = false;
    this._targetRack  = 0;
  }

  update(dt) {
    if (!this.enabled) return;
    this._runState(dt);

    // If box is grabbed, smoothly lerp it toward the effector (no teleport)
    if (this._currentBox && this.physics.grabbedBody === this._currentBox.body) {
      const ep = this.arm.getEffectorWorldPosition();
      const t  = Math.min(12 * dt, 1);
      const mp = this._currentBox.mesh.position;
      mp.lerp(ep, t);
      this.physics.setGrabbedPosition(mp.x, mp.y, mp.z);
    }
  }

  // ── State machine ────────────────────────────────────────────

  _runState(dt) {
    const spd = this.speed * dt;

    switch (this.state) {
      case 'IDLE':
        break;

      case 'APPROACH_PICKUP': {
        const done = this._lerpToTarget(spd);
        if (done) {
          this.statusText = `Descendiendo a caja ${this._currentBox.id + 1}`;
          this._setTarget(POSE.pickDown);
          this._setState('DESCEND_PICKUP');
        }
        break;
      }

      case 'DESCEND_PICKUP': {
        const done = this._lerpToTarget(spd);
        if (done) this._setState('GRIP');
        break;
      }

      case 'GRIP': {
        this.arm.setGripper(false);
        this.warehouse.markBoxGrabbed(this._currentBox);
        this.physics.grab(this._currentBox.body);
        this.statusText = `Caja ${this._currentBox.id + 1} sujetada`;
        // First fold arm at pickup side before any rotation
        this._setTarget(POSE.tuckPickup);
        this._setState('SCAN');
        break;
      }

      case 'SCAN': {
        // Arm holds still — vision classifier runs 1.5s scan
        if (!this._scanStarted && this.vision) {
          this._scanStarted = true;
          const colorType = this._currentBox.colorType;
          this.vision.startScan(colorType, (type) => {
            this._targetRack  = type === 'green' ? 0 : 1;
            this._currentSlot = this.warehouse.getNextShelfSlot(this._targetRack);
            if (!this._currentSlot) {
              // Rack full — return home gracefully
              this.statusText = 'Estante lleno';
              this._currentBox = null;
              this._setTarget(POSE.tuckPickup);
              this._setState('LIFT');  // LIFT → TUCK_TO_HOME → RETURN_HOME
              this._scanStarted = false;
              return;
            }
            const slotIdx     = this.warehouse.shelfSlots
              .filter(s => s.rackId === this._targetRack)
              .indexOf(this._currentSlot);
            this._slotLevel   = slotIdx >= 0 ? slotIdx : 0;
            this._setState('LIFT');
            this._scanStarted = false;
          });
        } else if (!this.vision) {
          // No vision module — fall through immediately (HUD bypassed)
          this._targetRack  = this._currentBox.colorType === 'green' ? 0 : 1;
          this._currentSlot = this.warehouse.getNextShelfSlot(this._targetRack);
          if (!this._currentSlot) {
            this.statusText = 'Estante lleno';
            this._currentBox = null;
            this._setTarget(POSE.tuckPickup);
            this._setState('LIFT');
            return;
          }
          const slotIdx     = this.warehouse.shelfSlots
            .filter(s => s.rackId === this._targetRack)
            .indexOf(this._currentSlot);
          this._slotLevel   = slotIdx >= 0 ? slotIdx : 0;
          this._setState('LIFT');
        }
        break;
      }

      case 'LIFT': {
        // Arm folds to compact tuck pose (J1 stays at -90°)
        const done = this._lerpToTarget(spd * 0.9);
        if (done) {
          // Now rotate J1 from -90° to +90° while keeping arm folded
          // Both J1 change and arm already folded → safe sweep, no shelf collision
          this._setTarget(this._targetRack === 1 ? POSE.tuckShelf2 : POSE.tuckShelf);
          this.statusText = `Rotando hacia estante...`;
          this._setState('TUCK_TO_SHELF');
        }
        break;
      }

      case 'TUCK_TO_SHELF': {
        // J1 sweeps toward shelf; J2/J3 stay folded
        const done = this._lerpToTarget(spd * 0.65);
        if (done) {
          const poses = this._targetRack === 1 ? PLACE_POSES_RACK2 : PLACE_POSES;
          const pose  = poses[this._slotLevel];
          this._setTarget(pose.approach);
          this.statusText = `Extendiendo a nivel ${this._slotLevel + 1}`;
          this._setState('APPROACH_SHELF');
        }
        break;
      }

      case 'APPROACH_SHELF': {
        // Unfold arm toward shelf
        const done = this._lerpToTarget(spd);
        if (done) {
          const poses = this._targetRack === 1 ? PLACE_POSES_RACK2 : PLACE_POSES;
          const pose  = poses[this._slotLevel];
          this._setTarget(pose.down);
          this.statusText = `Depositando en estante`;
          this._setState('DESCEND_SHELF');
        }
        break;
      }

      case 'DESCEND_SHELF': {
        const done = this._lerpToTarget(spd * 0.75);
        if (done) this._setState('PLACE');
        break;
      }

      case 'PLACE': {
        this.arm.setGripper(true);
        // Snap box to exact shelf slot and freeze — no physics explosion
        if (this._currentBox && this._currentSlot) {
          const sp = this._currentSlot.position;
          this.physics.placeAt(this._currentBox.body, this._currentBox.mesh, sp.x, sp.y, sp.z);
        }
        this.warehouse.markBoxPlaced(this._currentBox, this._currentSlot);
        this.statusText = `Caja ${this._currentBox.id + 1} almacenada ✓`;
        this._currentBox = null;
        // Fold arm back at shelf side before rotating away
        this._setTarget(this._targetRack === 1 ? POSE.tuckShelf2 : POSE.tuckShelf);
        this._setState('RETRACT');
        break;
      }

      case 'RETRACT': {
        // Fold arm back to compact tuck at shelf side (J1 stays at +90°)
        const done = this._lerpToTarget(spd * 1.1);
        if (done) {
          // Rotate J1 from +90° toward 0° with arm still folded
          this._setTarget(POSE.tuckHome);
          this._setState('TUCK_TO_HOME');
        }
        break;
      }

      case 'TUCK_TO_HOME': {
        // J1 sweeps +90° → 0°; arm folded — safe, no collisions
        const done = this._lerpToTarget(spd * 0.75);
        if (done) {
          this._setTarget(POSE.home);
          this._setState('RETURN_HOME');
        }
        break;
      }

      case 'RETURN_HOME': {
        // Unfold arm to normal home pose (J1 already at 0)
        const done = this._lerpToTarget(spd * 0.9);
        if (done) {
          if (this.warehouse.allPlaced()) {
            this.enabled = false;
            this.state = 'IDLE';
            this.statusText = '¡Todas las cajas almacenadas!';
          } else {
            this._beginCycle();
          }
        }
        break;
      }
    }
  }

  _beginCycle() {
    // Prefer box nearest z=0 so the arm's fixed pickup axis aligns best
    const pending = this.warehouse.boxes.filter(b => b.state === 'pending');
    pending.sort((a, b) => Math.abs(a.mesh.position.z) - Math.abs(b.mesh.position.z));
    this._currentBox  = pending[0] || null;
    this._currentSlot = null;  // will be set in SCAN callback

    if (!this._currentBox) {
      this.enabled = false;
      this.state = 'IDLE';
      this.statusText = this.warehouse.allPlaced()
        ? '¡Todas las cajas almacenadas!'
        : 'Sin espacio en estante';
      return;
    }

    this.arm.setGripper(true);
    this.statusText = `Buscando caja ${this._currentBox.id + 1}`;
    this._setTarget(POSE.pickApproach);
    this._setState('APPROACH_PICKUP');
  }

  _setState(s) {
    this.state = s;
  }

  _setTarget(pose) {
    this._targetPose = [...pose];
  }

  // Lerp current angles toward target, return true when done
  _lerpToTarget(spd) {
    const current = [...this.arm.angles];
    let maxDiff = 0;
    const next = current.map((a, i) => {
      const diff = this._targetPose[i] - a;
      maxDiff = Math.max(maxDiff, Math.abs(diff));
      return a + diff * Math.min(spd * 4, 1);
    });
    this.arm.setJointAngles(next);
    return maxDiff < LERP_THRESH;
  }
}
