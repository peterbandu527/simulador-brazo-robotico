// UI Controls — binds HTML elements to arm and automation

export class UIControls {
  constructor(arm, automation, warehouse) {
    this.arm = arm;
    this.automation = automation;
    this.warehouse = warehouse;

    this._manualMode = true; // false when automation is running
    this._sliders = [];

    this._bindSliders();
    this._bindButtons();
    this._bindSpeed();
    this._syncSlidersToArm();
  }

  // ── Sliders ──────────────────────────────────────────────────

  _bindSliders() {
    const ids = ['j1','j2','j3','j4','j5','j6'];
    ids.forEach((id, i) => {
      const input = document.getElementById(id);
      const valEl = document.getElementById(`${id}-val`);
      this._sliders.push({ input, valEl });

      input.addEventListener('input', () => {
        if (!this._manualMode) return; // ignore while auto is running
        const deg = parseFloat(input.value);
        valEl.textContent = `${deg}°`;
        this.arm.setJointAngle(i, deg * Math.PI / 180);
      });
    });
  }

  _syncSlidersToArm() {
    this.arm.angles.forEach((rad, i) => {
      const deg = Math.round(rad * 180 / Math.PI);
      this._sliders[i].input.value = deg;
      this._sliders[i].valEl.textContent = `${deg}°`;
    });
  }

  // ── Buttons ──────────────────────────────────────────────────

  _bindButtons() {
    const btnAuto  = document.getElementById('btn-auto');
    const btnHome  = document.getElementById('btn-home');
    const btnGrip  = document.getElementById('btn-grip');
    const btnReset = document.getElementById('btn-reset');

    btnAuto.addEventListener('click', () => {
      if (this.automation.enabled) {
        this.automation.stop();
        this._manualMode = true;
        btnAuto.classList.remove('active');
        btnAuto.textContent = '▶ AUTO';
      } else {
        this.automation.start();
        this._manualMode = false;
        btnAuto.classList.add('active');
        btnAuto.textContent = '⏹ STOP';
      }
    });

    btnHome.addEventListener('click', () => {
      if (this.automation.enabled) return;
      this.arm.setHome();
      this._syncSlidersToArm();
    });

    btnGrip.addEventListener('click', () => {
      if (this.automation.enabled) return;
      this.arm.setGripper(!this.arm.gripperOpen);
    });

    btnReset.addEventListener('click', () => {
      if (this.automation.enabled) {
        this.automation.stop();
        btnAuto.classList.remove('active');
        btnAuto.textContent = '▶ AUTO';
      }
      this._manualMode = true;
      this.arm.setHome();
      this.warehouse.resetBoxes();
      this._syncSlidersToArm();
      document.getElementById('status-text').textContent = 'Reset completo';
    });
  }

  // ── Speed slider ─────────────────────────────────────────────

  _bindSpeed() {
    const speedInput = document.getElementById('speed');
    const speedVal   = document.getElementById('speed-val');

    speedInput.addEventListener('input', () => {
      const v = parseFloat(speedInput.value);
      speedVal.textContent = v;
      this.automation.speed = v * 0.35; // map 1-10 to ~0.35-3.5
    });
    this.automation.speed = parseFloat(speedInput.value) * 0.35;
  }

  // ── Per-frame update: sync slider displays when in auto mode ─

  update() {
    const statusEl   = document.getElementById('status-text');
    const boxesEl    = document.getElementById('boxes-status');
    const gripperEl  = document.getElementById('gripper-status');

    statusEl.textContent  = this.automation.statusText;
    boxesEl.textContent   = `Almacenadas: ${this.warehouse.placedCount()} / ${this.warehouse.boxes.length}`;
    gripperEl.textContent = `Gripper: ${this.arm.gripperOpen ? 'Abierto' : 'Cerrado'}`;

    // Keep sliders in sync with arm when auto mode is active
    if (!this._manualMode) {
      this.arm.angles.forEach((rad, i) => {
        const deg = Math.round(rad * 180 / Math.PI);
        this._sliders[i].input.value = deg;
        this._sliders[i].valEl.textContent = `${deg}°`;
      });
    }
  }
}
