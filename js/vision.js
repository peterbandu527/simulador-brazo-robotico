const SCAN_DURATION = 1.5;  // seconds

export class VisionClassifier {
  constructor(gripperCam) {
    this._cam       = gripperCam;
    this._state     = 'IDLE';
    this._elapsed   = 0;
    this._colorType = null;
    this._onClassified = null;
  }

  startScan(colorType, onClassified) {
    this._colorType    = colorType;
    this._onClassified = onClassified;
    this._elapsed      = 0;
    this._state        = 'SCANNING';
  }

  update(dt) {
    if (this._state !== 'SCANNING') return;
    this._elapsed += dt;
    this._cam.updateScanProgress(this._elapsed / SCAN_DURATION);
    if (this._elapsed >= SCAN_DURATION) {
      this._state = 'CLASSIFIED';
      this._cam.showClassification(this._colorType);
      this._onClassified?.(this._colorType);
    }
  }

  reset() {
    this._state   = 'IDLE';
    this._elapsed = 0;
    this._cam.clearClassification();
  }
}
