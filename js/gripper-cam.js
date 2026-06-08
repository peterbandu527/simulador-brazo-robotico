import * as THREE from 'three';

export class GripperCamera {
  constructor(scene, arm) {
    this._scene = scene;
    this._arm   = arm;

    // ── Secondary renderer → pip-canvas ────────────────────
    this._canvas   = document.getElementById('pip-canvas');
    this._renderer = new THREE.WebGLRenderer({
      canvas: this._canvas, antialias: false, alpha: false,
    });
    this._renderer.setSize(320, 240);
    this._renderer.setPixelRatio(1);
    this._renderer.shadowMap.enabled = false;
    // Match main renderer tone mapping so lighting looks consistent
    this._renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure  = 1.8;

    // ── Camera: looks forward from gripper tip ──────────────
    this._cam = new THREE.PerspectiveCamera(72, 320 / 240, 0.04, 20);

    // Cached vectors — avoid per-frame GC pressure at 60 fps
    this._j6pos      = new THREE.Vector3();
    this._wq         = new THREE.Quaternion();
    this._j6up       = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();

    // ── DOM element cache ───────────────────────────────────
    const g = id => document.getElementById(id);
    this._elLabel   = g('pip-label');
    this._elStatus  = g('pip-status');
    this._elBar     = g('pip-bar');
    this._elScanTxt = g('pip-scan-txt');
  }

  // Called every frame — sync camera + render PiP
  update() {
    const j6 = this._arm.joints?.[5];
    if (!j6) return;

    j6.getWorldPosition(this._j6pos);
    j6.getWorldQuaternion(this._wq);

    // Camera at the wrist joint (j6), looking along j6's +Y toward the effector tip.
    // Sitting inside arm geometry is fine: back-face culled meshes are invisible from inside.
    // "up" = j6's local X in world space — prevents gimbal lock at all arm orientations,
    // including home pose where j6's +Y ≈ world +Y.
    this._cam.position.copy(this._j6pos);
    this._j6up.set(1, 0, 0).applyQuaternion(this._wq);
    this._cam.up.copy(this._j6up);

    this._lookTarget.copy(this._arm.getEffectorWorldPosition());
    this._cam.lookAt(this._lookTarget);

    this._renderer.render(this._scene, this._cam);
  }

  // ── HUD updates ────────────────────────────────────────────

  updateScanProgress(progress) {
    if (this._elStatus)  this._elStatus.textContent = 'ESCANEANDO';
    if (this._elScanTxt) this._elScanTxt.textContent = 'ANALIZANDO...';
    if (this._elBar) {
      this._elBar.style.width      = `${Math.round(progress * 100)}%`;
      this._elBar.style.background = '#4da6ff';
    }
  }

  showClassification(type) {
    const isGreen = type === 'green';
    const color   = isGreen ? '#22cc44' : '#dd2222';
    const text    = isGreen ? 'VERDE ✓' : 'ROJO ✓';
    const rack    = isGreen ? 'RACK-1' : 'RACK-2';

    if (this._elLabel)  { this._elLabel.textContent = text; this._elLabel.style.color = color; }
    if (this._elStatus)  this._elStatus.textContent = 'CLASIFICADO';
    if (this._elScanTxt) this._elScanTxt.textContent = `DESTINO: ${rack}`;
    if (this._elBar)    { this._elBar.style.width = '100%'; this._elBar.style.background = color; }
  }

  clearClassification() {
    if (this._elLabel)  { this._elLabel.textContent = 'LIBRE'; this._elLabel.style.color = '#c8d8f0'; }
    if (this._elStatus)  this._elStatus.textContent = 'SISTEMA ACTIVO';
    if (this._elScanTxt) this._elScanTxt.textContent = 'SISTEMA ACTIVO';
    if (this._elBar)    { this._elBar.style.width = '0%'; this._elBar.style.background = '#4da6ff'; }
  }
}
