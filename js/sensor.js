import * as THREE from 'three';

const COLOR_IDLE   = new THREE.Color(0x00ff88);
const COLOR_DETECT = new THREE.Color(0xff6600);
const SWEEP_RANGE  = Math.PI / 4;   // ±45°
const MAX_DIST     = 8;

export class SensorArray {
  constructor(scene, arm, warehouse) {
    this.scene     = scene;
    this.arm       = arm;
    this.warehouse = warehouse;

    this._raycaster = new THREE.Raycaster();
    this._boxMeshes = warehouse.boxes.map(b => b.mesh);
    this._sensors   = this._buildSensors();
    this._cacheEls();
  }

  update(dt) {
    this._sensors.forEach(s => this._updateSensor(s, dt));
    this._updateUI();
  }

  getSensorData() {
    return this._sensors.map(({ name, detected, targetId, distance, sweepAngle }) =>
      ({ name, detected, targetId, distance, sweepAngle })
    );
  }

  // ── Construction ──────────────────────────────────────────────

  _buildSensors() {
    return [
      // SCANNER-A: fixed overhead above pickup zone, sweeps along Z to cover the box row
      this._makeSensor('SCANNER-A', 'pickup',
        new THREE.Vector3(-3.5, 4.5, 0), 0.8),
      // SCANNER-B: follows effector, always scans forward from gripper
      this._makeSensor('SCANNER-B', 'effector',
        new THREE.Vector3(0, 0, 0), 1.2),
      // SCANNER-C: to the left of the shelf at shelf mid-height, scans toward +X
      this._makeSensor('SCANNER-C', 'shelf',
        new THREE.Vector3(1.5, 2.0, 0), 0.6),
    ];
  }

  _makeSensor(name, type, origin, sweepSpeed) {
    // Laser line geometry (2 points: start → end)
    const pts = [new THREE.Vector3(), new THREE.Vector3(0, -MAX_DIST, 0)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: COLOR_IDLE, transparent: true, opacity: 0.6,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    // Hit marker — small pulsing sphere at detection point
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: COLOR_DETECT, transparent: true, opacity: 0 })
    );
    this.scene.add(marker);

    return {
      name, type,
      origin: origin.clone(),
      sweepAngle: 0,  // start centered so sweep stays within ±SWEEP_RANGE from frame 1
      sweepSpeed, sweepDir: 1,
      detected: false, targetId: null, distance: 0,
      hitTimer: 0, line, marker,
      linePts: geo.attributes.position,
    };
  }

  // ── Per-frame update ──────────────────────────────────────────

  _updateSensor(s, dt) {
    // Advance sweep oscillation — clamp to prevent runaway outside ±SWEEP_RANGE
    s.sweepAngle += s.sweepDir * s.sweepSpeed * dt;
    if (s.sweepAngle >  SWEEP_RANGE) { s.sweepAngle =  SWEEP_RANGE; s.sweepDir = -1; }
    if (s.sweepAngle < -SWEEP_RANGE) { s.sweepAngle = -SWEEP_RANGE; s.sweepDir =  1; }

    // Origin and direction per sensor type
    let origin, dir;
    if (s.type === 'pickup') {
      origin = s.origin;
      // Sweep along Z-axis from overhead so the beam scans the full row of boxes
      dir    = new THREE.Vector3(0, -1, Math.sin(s.sweepAngle) * 0.6).normalize();
    } else if (s.type === 'effector') {
      origin = this.arm.getEffectorWorldPosition().clone()
                 .add(new THREE.Vector3(0, 0.12, 0));
      dir    = new THREE.Vector3(
        Math.sin(s.sweepAngle), -0.6, Math.cos(s.sweepAngle * 0.5)
      ).normalize();
    } else {  // shelf scanner
      origin = s.origin;
      dir    = new THREE.Vector3(0.6, Math.sin(s.sweepAngle), 0).normalize();
    }

    // Raycast against all box meshes
    this._raycaster.set(origin, dir);
    this._raycaster.far = MAX_DIST;
    const hits = this._raycaster.intersectObjects(this._boxMeshes);
    const hit  = hits[0] || null;

    s.detected = !!hit;
    s.distance = hit ? hit.distance : 0;
    s.targetId = hit
      ? this.warehouse.boxes.findIndex(b => b.mesh === hit.object)
      : null;

    // Update laser line geometry
    const endPt = hit
      ? hit.point.clone()
      : origin.clone().add(dir.clone().multiplyScalar(MAX_DIST));

    s.linePts.setXYZ(0, origin.x, origin.y, origin.z);
    s.linePts.setXYZ(1, endPt.x,  endPt.y,  endPt.z);
    s.linePts.needsUpdate = true;
    s.line.geometry.computeBoundingSphere();
    s.line.material.color.set(hit ? COLOR_DETECT : COLOR_IDLE);
    s.line.material.opacity = hit ? 0.9 : 0.45;

    // Hit marker pulse animation
    if (hit) {
      s.hitTimer = 0.35;
      s.marker.position.copy(hit.point);
    }
    if (s.hitTimer > 0) {
      s.hitTimer -= dt;
      const t  = s.hitTimer / 0.35;
      const sc = 1 + Math.sin(Date.now() * 0.012) * 0.35;
      s.marker.scale.setScalar(sc * t);
      s.marker.material.opacity = t * 0.85;
    } else {
      s.marker.material.opacity = 0;
    }
  }

  // ── Telemetry UI ──────────────────────────────────────────────

  _cacheEls() {
    const g = id => document.getElementById(id);
    this._el = {
      saStatus: g('sa-status'), saTarget: g('sa-target'),
      saDist:   g('sa-dist'),   saSweep:  g('sa-sweep'),
      sbStatus: g('sb-status'), sbTarget: g('sb-target'), sbDist: g('sb-dist'),
      scStatus: g('sc-status'), scTarget: g('sc-target'),
      scDist:   g('sc-dist'),   scSlots:  g('sc-slots'),
    };
  }

  _updateUI() {
    const [sa, sb, sc] = this._sensors;
    this._fillSensor(sa, this._el.saStatus, this._el.saTarget, this._el.saDist);
    this._fillSensor(sb, this._el.sbStatus, this._el.sbTarget, this._el.sbDist);
    this._fillSensor(sc, this._el.scStatus, this._el.scTarget, this._el.scDist);

    if (this._el.saSweep) {
      this._el.saSweep.textContent =
        `${(sa.sweepAngle * 180 / Math.PI).toFixed(0)}\u00b0`;
    }

    if (this._el.scSlots) {
      const free  = this.warehouse.shelfSlots.filter(s => !s.occupied).length;
      const total = this.warehouse.shelfSlots.length;
      this._el.scSlots.textContent = `${free} / ${total} libres`;
    }
  }

  _fillSensor(s, statusEl, targetEl, distEl) {
    if (!statusEl) return;
    statusEl.textContent = s.detected ? '\u25cf DETECTADO' : '\u25cb LIBRE';
    statusEl.style.color = s.detected ? '#ff8800' : '#44cc88';
    if (targetEl) targetEl.textContent = s.detected ? `CAJA #${s.targetId + 1}` : '---';
    if (distEl)   distEl.textContent   = s.detected ? `${s.distance.toFixed(2)} m` : '---';
  }
}
