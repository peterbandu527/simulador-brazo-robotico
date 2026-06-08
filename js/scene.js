import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.8;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);
  scene.fog = new THREE.FogExp2(0x0d1117, 0.035);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(7, 6, 9);
  camera.lookAt(0, 1.5, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 3;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;

  // Hemisphere: sky (cool white) + ground (dark blue)
  const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x101828, 1.0);
  scene.add(hemi);

  // Ambient fill
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  // Main directional light (shadows)
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.5);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // Secondary directional (fill from opposite side)
  const fill = new THREE.DirectionalLight(0x80a0ff, 1.0);
  fill.position.set(-8, 8, -6);
  scene.add(fill);

  // Industrial ceiling spotlights over each zone
  const ceilY = 5.5;
  const ceilPositions = [[-3.5, ceilY, 0], [0, ceilY, 0], [3.5, ceilY, 0]];
  for (const [cx, cy, cz] of ceilPositions) {
    const spot = new THREE.PointLight(0xfff0d0, 2.5, 12, 1.5);
    spot.position.set(cx, cy, cz);
    scene.add(spot);
  }

  // Blue fill light from the side
  const fillLight = new THREE.PointLight(0x2060c0, 1.5, 18);
  fillLight.position.set(-6, 4, -4);
  scene.add(fillLight);

  // Orange accent light
  const accentLight = new THREE.PointLight(0xf06020, 1.0, 14);
  accentLight.position.set(6, 2, -5);
  scene.add(accentLight);

  // Floor
  const floorGeo = new THREE.PlaneGeometry(24, 24);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x1a2030,
    roughness: 0.9,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid overlay
  const grid = new THREE.GridHelper(24, 24, 0x1e3050, 0x172040);
  grid.position.y = 0.002;
  scene.add(grid);

  // Floor markings: painted lines for zones
  addFloorMarking(scene, -3.5, 0, 2.5, 2.8, 0xf0c020, 0.05); // pickup zone (yellow)
  addFloorMarking(scene,  3.5, 0, 2.5, 2.8, 0x2080ff, 0.05); // shelf zone (blue)

  // Ceiling lights decoration
  for (let i = -2; i <= 2; i++) {
    const lightBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.05, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xd0e8ff, emissive: 0x6090cc, emissiveIntensity: 1.0 })
    );
    lightBar.position.set(i * 2, 5.8, 0);
    scene.add(lightBar);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls };
}

function addFloorMarking(scene, cx, cz, w, d, color, yOff) {
  const geo = new THREE.PlaneGeometry(w, d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.2,
    roughness: 1,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, yOff, cz);
  scene.add(mesh);

  // Border frame
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.01, d));
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 })
  );
  line.position.set(cx, yOff + 0.005, cz);
  scene.add(line);
}
