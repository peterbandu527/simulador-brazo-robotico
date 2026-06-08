import { createScene }           from './scene.js';
import { RoboticArm }            from './arm.js';
import { PhysicsWorld }          from './physics.js';
import { WarehouseManager }      from './warehouse.js';
import { AutomationController }  from './automation.js';
import { UIControls }            from './controls.js';
import { SensorArray }           from './sensor.js';
import { ProceduralEnvironment } from './environment.js';
import { GripperCamera }         from './gripper-cam.js';
import { VisionClassifier }      from './vision.js';

// ── Init ──────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const { renderer, scene, camera, controls } = createScene(canvas);

const physics    = new PhysicsWorld();
const arm        = new RoboticArm(scene);
const warehouse  = new WarehouseManager(scene, physics);
const gripperCam = new GripperCamera(scene, arm);
const vision     = new VisionClassifier(gripperCam);
const automation = new AutomationController(arm, warehouse, physics, vision);
const ui         = new UIControls(arm, automation, warehouse);
const env        = new ProceduralEnvironment(scene, warehouse);
const sensors    = new SensorArray(scene, arm, warehouse);

// ── Game loop ─────────────────────────────────────────────────
let lastTime = 0;

function animate(time) {
  requestAnimationFrame(animate);

  const dt = Math.min((time - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = time;

  // 1. Advance physics
  physics.step(dt);

  // 2. Advance automation (moves arm joints + manages box grab/release)
  automation.update(dt);

  // 3. Advance vision classifier scan animation (MUST run after automation)
  vision.update(dt);

  // 4. Update sensor array (raycasting + telemetry UI)
  sensors.update(dt);

  // 5. Sync physics bodies → Three.js meshes
  physics.syncMeshes();

  // 6. Update UI displays
  ui.update();

  // 7. Animate environment (dust particles)
  env.update(dt);

  // 8. Update orbit controls damping
  controls.update();

  // 9. Render main view + PiP gripper camera
  gripperCam.update();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
