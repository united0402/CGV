import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as CANNON from "cannon-es";
import { DRACOLoader } from "three/examples/jsm/Addons.js";
// SCENE SETUP
const scene = new THREE.Scene();

scene.background = new THREE.Color(0x6789);
let cameraMode = 0;
const cameraOffset = new THREE.Vector3(0, 15, -25); // FIFA-style camera offset
const cameraLerpFactor = 0.1; // Smooth camera follow
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 30, 100);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// LIGHTING


renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // soft shadows look smoother

// 2️⃣ Make light cast shadows
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 100, 50);
light.castShadow = true;

// optional: tweak shadow quality
light.shadow.mapSize.width = 2048;
light.shadow.mapSize.height = 2048;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 500;
light.shadow.camera.left = -100;
light.shadow.camera.right = 100;
light.shadow.camera.top = 100;
light.shadow.camera.bottom = -100;
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// CANNON.JS PHYSICS
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
const timeStep = 1 / 60;

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/'); // path to Draco decoder
loader.setDRACOLoader(dracoLoader);
let stadium, ball, player,alienplayer, mixer, alienmixer,actions = {},alienactions = {};
let playerBody,alienplayerBody, ballBody,keeperBody,humankeeperBody;
let currentState = "idle"; // idle | run | kick | pass
let currentAction = null;
let aliencurrentState = "idle"; // idle | run | kick | pass
let aliencurrentAction = null;
const clock = new THREE.Clock();
let groundTopY = 0;
let groundBody, debugGround;
let playerOriginToBottom = 0;          // distance from player origin to feet (world units)
let playerColliderHalfTotal = 0;    
let alienplayerOriginToBottom = 0;          // distance from player origin to feet (world units)
let alienplayerColliderHalfTotal = 0;    // (height/2 + radius) in world units (for capsule)
let ballRadiusWorld = 0;
let score = 0;
let scoreDiv;
let goalZones = [];
let secondGoalPos
let isPassing
let isKicking
let isalienPassing
let isalienKicking
let goal1Body, goal2Body;
const blockers = [];
let firstPost
let secondPost
let keeper, keeperMixer, keeperActions = {}, currentKeeperAction, currentKeeperState;
let humankeeper, humankeeperMixer, humankeeperActions = {}, currentHumanKeeperAction, currentHumanKeeperState;
let netAnims = []; // active net animations
let currentLevel = 1;
let maxKeeperSpeed = 0.5; // default (same as your current maxSpeed)
let levelConfig = {
  1: { name: "Easy", numBlocks: 0, keeperSpeed: 0.5 },
  2: { name: "Medium", numBlocks: 2, keeperSpeed: 0.5 },
  3: { name: "Hard", numBlocks: 4, keeperSpeed: 8 },
}
// Better solver to reduce penetration
world.solver.iterations = 8;
world.solver.tolerance = 0.001;
// STADIUM LOADING
//scene.rotation.y = Math.PI / 2
loader.load("/models/stadium.glb", (gltf) => {
  stadium = gltf.scene;
  stadium.scale.set(5, 5, 5);
  stadium.position.set(0, 0, 0);
  stadium.rotation.y = Math.PI / 2;
  scene.add(stadium);
const crowdMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
// Try to find the stand mesh
const stands = stadium.getObjectByName("stands2"); 
const stands2 = stadium.getObjectByName("stands3");// or whatever your stands are named
if (stands2) {
  // Load a realistic crowd texture
  const crowdTexture = new THREE.TextureLoader().load("/models/crowd2.png", () => {
    //console.log("Crowd texture loaded!");
  });
  crowdTexture.wrapS = crowdTexture.wrapT = THREE.RepeatWrapping;
  crowdTexture.repeat.set(2, 1);

  // Apply material to every mesh inside the stands
  stands2.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshBasicMaterial({
        map: crowdTexture,
        color: 0xfff,
        transparent: true,
      });
    }
  });

  // --- Animation: simulate flashlight flickers + cheering waves ---
  const uniforms = {
    time: { value: 0 },
    tex: { value: crowdTexture },
  };

  // Replace the material with a shader that animates brightness subtly
  stands2.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tex;
          uniform float time;
          varying vec2 vUv;

          void main() {
            vec4 texColor = texture2D(tex, vUv);

            // subtle waving brightness based on position and time
            float wave = sin(vUv.x * 20.0 + time * 3.0) * 0.15 + sin(vUv.y * 15.0 + time * 2.0) * 0.1;
            float flicker = (fract(sin(dot(vUv.xy * 200.0, vec2(12.9898,78.233))) * 43758.5453 + time) - 0.5) * 0.3;

            float brightness = 0.8 + wave + flicker;
            gl_FragColor = vec4(texColor.rgb * brightness, texColor.a);
          }
        `,
      });
    }
  });

  // Add to animation loop
  const clock = new THREE.Clock();
  function updateCrowd() {
    uniforms.time.value = clock.getElapsedTime();
    requestAnimationFrame(updateCrowd);
  }
  updateCrowd();
} else {
  console.log("Stands2 not found");
}
if (stands) {
  // Load a realistic crowd texture
  const crowdTexture = new THREE.TextureLoader().load("/models/crowd2.png", () => {
    console.log("Crowd texture loaded!");
  });
  crowdTexture.wrapS = crowdTexture.wrapT = THREE.RepeatWrapping;
  crowdTexture.repeat.set(2, 1);

  // Apply material to every mesh inside the stands
  stands.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshBasicMaterial({
        map: crowdTexture,
        color: 0xfff,
        transparent: true,
      });
    }
  });

  // --- Animation: simulate flashlight flickers + cheering waves ---
  const uniforms = {
    time: { value: 0 },
    tex: { value: crowdTexture },
  };

  // Replace the material with a shader that animates brightness subtly
  stands.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tex;
          uniform float time;
          varying vec2 vUv;

          void main() {
            vec4 texColor = texture2D(tex, vUv);

            // subtle waving brightness based on position and time
            float wave = sin(vUv.x * 20.0 + time * 3.0) * 0.15 + sin(vUv.y * 15.0 + time * 2.0) * 0.1;
            float flicker = (fract(sin(dot(vUv.xy * 200.0, vec2(12.9898,78.233))) * 43758.5453 + time) - 0.5) * 0.3;

            float brightness = 0.8 + wave + flicker;
            gl_FragColor = vec4(texColor.rgb * brightness, texColor.a);
          }
        `,
      });
    }
  });

  // Add to animation loop
  const clock = new THREE.Clock();
  function updateCrowd() {
    uniforms.time.value = clock.getElapsedTime();
    requestAnimationFrame(updateCrowd);
  }
  updateCrowd();
} else {
  console.log("Stands not found");
}



  // important: update matrices so setFromObject will consider scale/transform
  stadium.updateMatrixWorld(true);
firstPost = stadium.getObjectByName("firstpost");
secondPost = stadium.getObjectByName("secondpost");
const lines = stadium.getObjectByName("lines");
const ground2 = stadium.getObjectByName("secondground");
if (lines) {
  lines.visible = false
}
if (ground2) {
  ground2.visible = false
}
if (firstPost) {
  firstPost.visible = false
}
if (secondPost) {
  secondPost.visible = false
}
  // Find ground mesh
  const groundMesh = stadium.getObjectByName("ground");
  if (groundMesh) {
    groundMesh.receiveShadow = true;
    groundMesh.visible = false
    // compute world-space bounding box (handles parent scale/transform)
    const groundBox = new THREE.Box3().setFromObject(groundMesh);

    const groundSize = new THREE.Vector3();
    groundBox.getSize(groundSize);

    const groundCenter = new THREE.Vector3();
    groundBox.getCenter(groundCenter);

    // top Y of the mesh in world coords (use this to place bodies)
    groundTopY = groundBox.max.y;

    // Give the physics ground a small thickness and align its TOP to the mesh top
    const thickness = 8;
    const halfExtents = new CANNON.Vec3(groundSize.x / 2, thickness / 2, groundSize.z / 2);

    const shape = new CANNON.Box(halfExtents);
    groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(shape);

    // set the physics box so its top aligns exactly with groundTopY
    groundBody.position.set(groundCenter.x, groundTopY - thickness / 2, groundCenter.z);
    world.addBody(groundBody);

    // DEBUG visual: wireframe box at the physics collider
    const gm = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true,visible:false });
    const geom = new THREE.BoxGeometry(groundSize.x, thickness, groundSize.z);
    debugGround = new THREE.Mesh(geom, gm);
    debugGround.position.copy(groundBody.position);
    scene.add(debugGround);
    const fieldWidth = groundSize.x;
const fieldDepth = groundSize.z;

// place goals at the two opposite breadth sides (± along Z)
const goalOffsetZ = fieldDepth / 2 + 0.01; // small offset so they don’t clip inside

addGoalZone(
  "goal1",
  groundCenter.x,                // middle on X
  groundCenter.z - goalOffsetZ,  // back side
  30, 10, 5, 0xffaa00
);

addGoalZone(
  "goal2",
  groundCenter.x,                // middle on X
  groundCenter.z + goalOffsetZ,  // front side
  20, 10, 5, 0x00aaff
);

goalZones.forEach((gz) => {
  if (gz.name === "goal1") goal1Body = gz;
  if (gz.name === "goal2") goal2Body = gz;
});

// Use goal2 as alien's scoring target

if (goal2Body) {
  secondGoalPos = new THREE.Vector3(
    goal2Body.position.x,
    groundTopY,
    goal2Body.position.z
  );
  console.log("Alien will attack goal2 at:", secondGoalPos);
}
 
  } else {
    console.warn("Ground mesh named 'ground' not found in stadium.glb");
  }
 
loadKeeper();
//loadHumanKeeper()
; // After the ground exists, load ball and player
  loadBall();
  loadPlayer();
  //loadalienPlayer()
  loadLevel(currentLevel);

});

const levelLabel = document.createElement("div");
levelLabel.style.position = "absolute";
levelLabel.style.top = "10px";
levelLabel.style.left = "10px";
levelLabel.style.color = "white";
levelLabel.style.fontSize = "20px";
levelLabel.textContent = "Level: Easy";
document.body.appendChild(levelLabel);
// Load Keeper

function loadKeeper() {
  loader.load("/models/humankeeper.glb", (gltf) => {
    keeper = gltf.scene;
    keeper.scale.set(5, 5, 5);
    keeper.position.set(0, groundTopY, -20); // place in goal zone
    scene.add(keeper);

    // Animations
    keeperMixer = new THREE.AnimationMixer(keeper);
    gltf.animations.forEach((clip) => {
      

      const name = clip.name.toLowerCase();
      //console.log("Keeper clips:", name,clip.duration);
      if (name.includes("idle")) {
        keeperActions.idle = keeperMixer.clipAction(clip);
        keeperActions.idle.loop = THREE.LoopRepeat;
        keeperActions.idle.timeScale = 20;
      }  else if (name.includes("bodyblockright")) {
        keeperActions.bodyblockright = keeperMixer.clipAction(clip);
        keeperActions.bodyblockright.loop = THREE.LoopOnce;
        keeperActions.bodyblockright.clampWhenFinished = true;
        keeperActions.bodyblockright.timeScale = 20;
      } else if (name.includes("bodyblockleft")) {
        keeperActions.bodyblockleft = keeperMixer.clipAction(clip);
        keeperActions.bodyblockleft.loop = THREE.LoopOnce;
        keeperActions.bodyblockleft.clampWhenFinished = true;
        keeperActions.bodyblockleft.timeScale = 20;
      } else if (name.includes("kick")) {
  keeperActions.kick = keeperMixer.clipAction(clip);
  keeperActions.kick.loop = THREE.LoopOnce;
  keeperActions.kick.clampWhenFinished = true;
  //keeperActions.kick.timeScale = 1.5; // adjust for realism
}
    });

    // Play idle by default
    if (keeperActions.idle) keeperActions.idle.reset().play();;
    
const keeperHalfWidth = 0.8 * keeper.scale.x; // tune
    const keeperHeight = 1.8 * keeper.scale.y; // tune

    // make a kinematic body (mass 0 + type KINEMATIC) so we can move it manually
     keeperBody = new CANNON.Body({
      mass: 0, // kinematic
      type: CANNON.Body.KINEMATIC,
      position: new CANNON.Vec3(keeper.position.x, keeper.position.y, keeper.position.z),
    
    });

    // choose shape; box is simplest
    const box = new CANNON.Box(new CANNON.Vec3(keeperHalfWidth, keeperHeight*1.8,keeperHalfWidth));
    keeperBody.addShape(box);

    // store for later use & collisions
    keeper.userData.physicsBody = keeperBody;
    keeperBody.userData = { three: keeper }; // optional reverse link

    world.addBody(keeperBody);

    // If you already have goals, place keeper in the first one
    if (goalZones[0]) {
      placeKeeperAtGoal(goalZones[0], -2);
      // ensure physics body and visual align
      keeperBody.position.set(keeper.position.x, keeper.position.y, keeper.position.z);
    }
    
else{
  console.log("fff")
}
// Debug mesh for keeper collider
const debugGeometry = new THREE.BoxGeometry(
  keeperHalfWidth,      // width
  keeperHeight * 1.8,             // height
  keeperHalfWidth           // depth (same ratio as your CANNON box)
);
const debugMaterial = new THREE.MeshBasicMaterial({
  color: 0xff0000,
  wireframe: true,
  transparent: true,
  opacity: 0.4,
  visible:false
});
const keeperDebugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
scene.add(keeperDebugMesh);

// store in userData for syncing later
keeperBody.userData.debugMesh = keeperDebugMesh;

  });
}
function loadLevel(levelNum) {
  const level = levelConfig[levelNum];
  if (!level) return;

  // update global keeper speed
  maxKeeperSpeed = level.keeperSpeed;

  // clear existing blockers if any
  blockers.forEach(b => {
    scene.remove(b.mesh);
    world.removeBody(b.body);
  });
  blockers.length = 0;

  // add new blockers based on level
  for (let i = 0; i < level.numBlocks; i++) {
    const x = -10 + i * 10;   // spread horizontally
    const z = -5 + (i % 2) * 10;  // alternate depth
    const w = 5; const h = 8; const d = 6;
    const color = i % 2 === 0 ? 0x00ff88 : 0xff4444;
    addGoalBlocker(goalZones[0], 20, h, d, 1, color);
  }

  // update UI label
  levelLabel.textContent = `Level: ${level.name}`;

 // console.log(`Loaded Level ${levelNum}: ${level.name}, Blocks=${level.numBlocks}, KeeperSpeed=${level.keeperSpeed}`);
}

function loadHumanKeeper() {
  loader.load("/models/humankeeper.glb", (gltf) => {
    humankeeper = gltf.scene;
    humankeeper.scale.set(5, 5, 5);
    humankeeper.position.set(0, groundTopY, 20);
    humankeeper.rotation.y=Math.PI // place in goal zone
    scene.add(humankeeper);

    // Animations
    humankeeperMixer = new THREE.AnimationMixer(humankeeper);
    gltf.animations.forEach((clip) => {
      

      const name = clip.name.toLowerCase();
      //console.log("human Keeper clips:", name,clip.duration);
      if (name.includes("idle")) {
        humankeeperActions.idle = humankeeperMixer.clipAction(clip);
        humankeeperActions.idle.loop = THREE.LoopRepeat;
        humankeeperActions.idle.timeScale = 20;
      }  else if (name.includes("bodyblockright")) {
        humankeeperActions.bodyblockright = humankeeperMixer.clipAction(clip);
        humankeeperActions.bodyblockright.loop = THREE.LoopOnce;
        humankeeperActions.bodyblockright.clampWhenFinished = true;
        humankeeperActions.bodyblockright.timeScale = 20;
      } else if (name.includes("bodyblockleft")) {
        humankeeperActions.bodyblockleft = humankeeperMixer.clipAction(clip);
        humankeeperActions.bodyblockleft.loop = THREE.LoopOnce;
        humankeeperActions.bodyblockleft.clampWhenFinished = true;
        humankeeperActions.bodyblockleft.timeScale = 20;
      } else if (name.includes("kick")) {
  humankeeperActions.kick = humankeeperMixer.clipAction(clip);
  humankeeperActions.kick.loop = THREE.LoopOnce;
  humankeeperActions.kick.clampWhenFinished = true;
  //keeperActions.kick.timeScale = 1.5; // adjust for realism
}
    });

    // Play idle by default
    if (humankeeperActions.idle) humankeeperActions.idle.reset().play();;
    
const keeperHalfWidth = 0.8 * humankeeper.scale.x; // tune
    const keeperHeight = 1.8 * humankeeper.scale.y; // tune

    // make a kinematic body (mass 0 + type KINEMATIC) so we can move it manually
     humankeeperBody = new CANNON.Body({
      mass: 0, // kinematic
      type: CANNON.Body.KINEMATIC,
      position: new CANNON.Vec3(humankeeper.position.x, humankeeper.position.y, humankeeper.position.z),
    
    });

    // choose shape; box is simplest
    const box = new CANNON.Box(new CANNON.Vec3(keeperHalfWidth, keeperHeight*1.8,keeperHalfWidth));
    humankeeperBody.addShape(box);

    // store for later use & collisions
    humankeeper.userData.physicsBody = humankeeperBody;
    humankeeperBody.userData = { three: humankeeper }; // optional reverse link

    world.addBody(humankeeperBody);

    // If you already have goals, place keeper in the first one
    if (goalZones[1]) {
      placeHumanKeeperAtGoal(goalZones[1], -2);
      // ensure physics body and visual align
      humankeeperBody.position.set(humankeeper.position.x, humankeeper.position.y, humankeeper.position.z);
    }
    
else{
  console.log("fff")
}
// Debug mesh for keeper collider
const debugGeometry = new THREE.BoxGeometry(
  keeperHalfWidth,      // width
  keeperHeight * 1.8,             // height
  keeperHalfWidth           // depth (same ratio as your CANNON box)
);
const debugMaterial = new THREE.MeshBasicMaterial({
  color: 0xff0000,
  wireframe: true,
  transparent: true,
  opacity: 0.4
});
const humankeeperDebugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
scene.add(humankeeperDebugMesh);

// store in userData for syncing later
humankeeperBody.userData.debugMesh = humankeeperDebugMesh;

  });
}

function placeKeeperAtGoal(goalZoneBody, offset = 4) {
  if (!keeper || !goalZoneBody) return;

  // get base position (center of goal)
  const goalPos = goalZoneBody.position;

  // compute forward vector from goal orientation
  const forward = new CANNON.Vec3(0, 0, 1); // local forward in Z
  goalZoneBody.quaternion.vmult(forward, forward); // rotate into world space

  // place keeper in front of goal
  keeper.position.set(
    goalPos.x + forward.x * offset,
    groundTopY,
    goalPos.z + forward.z * offset
  );
}
function placeHumanKeeperAtGoal(goalZoneBody, offset = 4) {
  if (!humankeeper || !goalZoneBody) return;

  // get base position (center of goal)
  const goalPos = goalZoneBody.position;

  // compute forward vector from goal orientation
  const forward = new CANNON.Vec3(0, 0, 1); // local forward in Z
  goalZoneBody.quaternion.vmult(forward, forward); // rotate into world space

  // place keeper in front of goal
  humankeeper.position.set(
    goalPos.x + forward.x * offset,
    groundTopY,
    goalPos.z + forward.z * offset
  );
}
// --- Animation Helper ---
function fadeToKeeperAction(name, duration = 0.2) {
  if (!keeperActions[name]) {
    console.warn("no keeper action for", name);
    return;
  }
  const nextAction = keeperActions[name];
  if (currentKeeperAction === nextAction) return;

  if (currentKeeperAction) {
    currentKeeperAction.fadeOut(duration);
  }

  nextAction.reset();
  nextAction.paused = false;
  nextAction.enabled = true;
  nextAction.time = 0;

  nextAction.fadeIn(duration).play();
  currentKeeperAction = nextAction;
  currentKeeperState = name;
}
function fadeToHumanKeeperAction(name, duration = 0.2) {
  if (!humankeeperActions[name]) {
    console.warn("no human keeper action for", name);
    return;
  }
  const nextAction = humankeeperActions[name];
  if (currentHumanKeeperAction === nextAction) return;

  if (currentHumanKeeperAction) {
    currentHumanKeeperAction.fadeOut(duration);
  }

  nextAction.reset();
  nextAction.paused = false;
  nextAction.enabled = true;
  nextAction.time = 0;

  nextAction.fadeIn(duration).play();
  currentHumanKeeperAction = nextAction;
  currentHumanKeeperState = name;
}

// --- Keeper AI ---
function updateKeeperAI(ballBody, delta) {
  if (!keeper || !keeper.userData.physicsBody || !ballBody) return;

  // world positions
  const keeperPos = new THREE.Vector3();
  keeper.getWorldPosition(keeperPos);

  const ballPos = new THREE.Vector3(
    ballBody.position.x,
    ballBody.position.y,
    ballBody.position.z
  );

  // distance in XZ plane
  const dx = ballPos.x - keeperPos.x;
  const dz = ballPos.z - keeperPos.z;
  const horizontalDist = Math.hypot(dx, dz);

  // intercept movement (only X/Z)
  const maxSpeed = maxKeeperSpeed; // tune
  let vx = 0,
    vz = 0;
  if (horizontalDist > 0.1) {
    vx =
      (dx / horizontalDist) *
      Math.min(maxSpeed, horizontalDist / Math.max(delta, 1e-6)) *
      delta;
    vz =
      (dz / horizontalDist) *
      Math.min(maxSpeed, horizontalDist / Math.max(delta, 1e-6)) *
      delta;
  }

  // Candidate pos
  let newX = keeper.position.x + vx;
  let newZ = keeper.position.z + vz;

  // Clamp to goal mouth (X within posts, Z within small depth)
  if (goalZones && goalZones.length > 0) {
    let g = goalZones[0];
    let minDist = keeper.position.distanceTo(
      new THREE.Vector3(g.position.x, g.position.y, g.position.z)
    );
    for (const goal of goalZones) {
      const d = keeper.position.distanceTo(
        new THREE.Vector3(goal.position.x, goal.position.y, goal.position.z)
      );
      if (d < minDist) {
        g = goal;
        minDist = d;
      }
    }
    if (g) {
      const halfX = g.shapes[0].halfExtents.x;
      const leftX = g.position.x - halfX + 0.5;
      const rightX = g.position.x + halfX - 0.5;
      newX = Math.max(leftX, Math.min(rightX, newX));

      const goalZ = g.position.z;
      const depth = 3; // how far off goal line keeper may step
      newZ = THREE.MathUtils.clamp(newZ, goalZ - depth, goalZ + depth);
    }
  }

  // apply pos
  keeper.position.set(newX, groundTopY, newZ);

  // sync physics
  const kb = keeper.userData.physicsBody;
  kb.position.set(newX, groundTopY, newZ);
  kb.velocity.set(0, 0, 0);

  // -----------------------
  // ANIMATION DECISIONS
  // -----------------------

  // Check for realistic catch
 const kickRange = 3; // distance within which keeper kicks
if (horizontalDist < kickRange) {
  fadeToKeeperAction("kick");

  // Apply kick force to ball
  const kickPower = 25; // tweak
  const keeperDir = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(keeper.quaternion)
    .normalize();

  // Kick ball forward and slightly upward
  ballBody.velocity.set(
    keeperDir.x * kickPower,
    6, // lift it a bit
    keeperDir.z * kickPower
  );

  return; // don’t do dives/idle same frame
}


  // Otherwise: chance to dive if ball is near
  if (horizontalDist < 8 && Math.random() < 0.03) {
    fadeToKeeperAction(Math.random() > 0.5 ? "diveright" : "diveleft");
  } else {
    fadeToKeeperAction("idle");
  }
}

function updateHumanKeeperAI(ballBody, delta) {
  if (!humankeeper || !humankeeper.userData.physicsBody || !ballBody) return;

  // world positions
  const keeperPos = new THREE.Vector3();
  humankeeper.getWorldPosition(keeperPos);

  const ballPos = new THREE.Vector3(
    ballBody.position.x,
    ballBody.position.y,
    ballBody.position.z
  );

  // distance in XZ plane
  const dx = ballPos.x - keeperPos.x;
  const dz = ballPos.z - keeperPos.z;
  const horizontalDist = Math.hypot(dx, dz);

  // intercept movement (only X/Z)
  const maxSpeed = 8; // tune
  let vx = 0,
    vz = 0;
  if (horizontalDist > 0.1) {
    vx =
      (dx / horizontalDist) *
      Math.min(maxSpeed, horizontalDist / Math.max(delta, 1e-6)) *
      delta;
    vz =
      (dz / horizontalDist) *
      Math.min(maxSpeed, horizontalDist / Math.max(delta, 1e-6)) *
      delta;
  }

  // Candidate pos
  let newX = humankeeper.position.x + vx;
  let newZ = humankeeper.position.z + vz;

  // Clamp to goal mouth (X within posts, Z within small depth)
  if (goalZones && goalZones.length > 0) {
    let g = goalZones[1];
    let minDist = humankeeper.position.distanceTo(
      new THREE.Vector3(g.position.x, g.position.y, g.position.z)
    );
    for (const goal of goalZones) {
      const d = humankeeper.position.distanceTo(
        new THREE.Vector3(goal.position.x, goal.position.y, goal.position.z)
      );
      if (d < minDist) {
        g = goal;
        minDist = d;
      }
    }
    if (g) {
      const halfX = g.shapes[0].halfExtents.x;
      const leftX = g.position.x - halfX + 0.5;
      const rightX = g.position.x + halfX - 0.5;
      newX = Math.max(leftX, Math.min(rightX, newX));

      const goalZ = g.position.z;
      const depth = 3; // how far off goal line keeper may step
      newZ = THREE.MathUtils.clamp(newZ, goalZ - depth, goalZ + depth);
    }
  }

  // apply pos
  humankeeper.position.set(newX, groundTopY, newZ);

  // sync physics
  const kb = humankeeper.userData.physicsBody;
  kb.position.set(newX, groundTopY, newZ);
  kb.velocity.set(0, 0, 0);

  // -----------------------
  // ANIMATION DECISIONS
  // -----------------------

  // Check for realistic catch
 const kickRange = 3; // distance within which keeper kicks
if (horizontalDist < kickRange) {
  fadeToHumanKeeperAction("kick");

  // Apply kick force to ball
  const kickPower = 25; // tweak
  const keeperDir = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(humankeeper.quaternion)
    .normalize();

  // Kick ball forward and slightly upward
  ballBody.velocity.set(
    keeperDir.x * kickPower,
    6, // lift it a bit
    keeperDir.z * kickPower
  );

  return; // don’t do dives/idle same frame
}


  // Otherwise: chance to dive if ball is near
  if (horizontalDist < 8 && Math.random() < 0.03) {
    fadeToHumanKeeperAction(Math.random() > 0.5 ? "bodyblockright" : "bodyblockleft");
  } else {
    fadeToHumanKeeperAction("idle");
  }
}


function keepBallClose() {
  if (!playerBody || !ballBody || !player) return;

  const isMoving =
    keys.w || keys.s || keys.a || keys.d;

  const distance = playerBody.position.vsub(ballBody.position).length();
 // console.log("distance", distance)
 if (currentState==="kick" || currentState==="pass" || currentState==="tackle") {
 //console.log("innnnnn",distance)
  return
}else{
  //console.log("outtttttttttttttttt")
  if (!isMoving&&distance<7) {
 //console.log("distance2", distance)
     //If player stops and ball is near → freeze it
   ballBody.velocity.x = 0;
    ballBody.velocity.z = 0;
    ballBody.angularVelocity.set(0, 0, 0); // stop spinning too
  }
}
}

function loadBall() {
  loader.load("/models/ball.glb", (gltf) => {
    ball = gltf.scene;
    // NOTE: keep the same visual scale you used
    ball.scale.set(5, 5, 5);
    scene.add(ball);

    // ensure transforms are up-to-date so bounding box is correct
    ball.updateMatrixWorld(true);

    // compute world bounding box and approximate radius
    const ballBox = new THREE.Box3().setFromObject(ball);
    const ballSize = new THREE.Vector3();
    ballBox.getSize(ballSize);
    // approximate radius as half max dimension
    ballRadiusWorld = Math.max(ballSize.x, ballSize.y, ballSize.z) / 2;

    // create Cannon sphere using the computed world radius
    const ballShape = new CANNON.Sphere(ballRadiusWorld);
    ballBody = new CANNON.Body({
      mass: 1,
      position: new CANNON.Vec3(0, groundTopY + ballRadiusWorld + 0.01, 0), // spawn a hair above ground
      linearDamping: 0.4,
      angularDamping: 0.4,
    });
    ballBody.addShape(ballShape);
    world.addBody(ballBody);

    // Optional: contact materials to reduce sinking
    const ballMat = new CANNON.Material("ball");
    const groundMat = new CANNON.Material("ground");
    ballBody.material = ballMat;
    if (groundBody) groundBody.material = groundMat;
    const contact = new CANNON.ContactMaterial(ballMat, groundMat, {
      friction: 0.4,
      restitution: 0.1,
    });
    world.addContactMaterial(contact);

    // position visual to match physics initially
    ball.position.copy(ballBody.position);
    if (ballBody&&keeper) {
        ballBody.addEventListener("collide", (e) => {
  if (e.body === keeper.userData.physicsBody) {
    const impactForce = ballBody.velocity.length();

    if (keeperActions["catch"].isRunning()) {
      // ✅ Keeper catches the ball
      ballBody.velocity.set(0, 0, 0);
      ballBody.angularVelocity.set(0, 0, 0);

      // attach ball to keeper’s hands (approximate position)
      const keeperWorldPos = new THREE.Vector3();
      keeper.getWorldPosition(keeperWorldPos);
      ballBody.position.set(
        keeperWorldPos.x,
        keeperWorldPos.y + 1.5, // hand height approx
        keeperWorldPos.z + 0.5  // forward a bit
      );
    } else {
      // ❌ No catch → bounce back depending on impact
      const normal = new CANNON.Vec3().copy(ballBody.position).vsub(e.body.position).normalize();
      const bounceStrength = Math.min(impactForce * 0.5, 20);
      ballBody.velocity = normal.scale(bounceStrength);
    }
  }
});
    }
    
  }, undefined, (err) => console.error("Ball loading error:", err));
}

function loadalienPlayer() {
  loader.load("/models/alienplayer.glb",
    (gltf) => {
      alienplayer = gltf.scene;
      // Keep same visual scale as before
      alienplayer.scale.set(5, 5, 5);
      alienplayer.position.set(5, 0, 0);
      scene.add(alienplayer);

      // animations...
      alienmixer = new THREE.AnimationMixer(alienplayer);
      gltf.animations.forEach((clip) => {
       // console.log(clip.name,clip.duration)
        const name = clip.name.toLowerCase();
        if (name.includes("fastrun")) {
          alienactions.fastrun = alienmixer.clipAction(clip);
          alienactions.fastrun.loop = THREE.LoopRepeat;
        } else if (name.includes("idle")) {
          alienactions.idle = alienmixer.clipAction(clip);
          alienactions.idle.loop = THREE.LoopRepeat;
        }else if (name.includes("pass")) {
          //clip = THREE.AnimationUtils.subclip(clip, "pass", 70, 110); // frames
          alienactions.pass = alienmixer.clipAction(clip);
          alienactions.pass.loop = THREE.LoopOnce;
          alienactions.pass.clampWhenFinished = true;
        } else if (name.includes("kick")) {
          //clip = THREE.AnimationUtils.subclip(clip, "kick", 110, 170); // frames
          alienactions.kick = alienmixer.clipAction(clip);
          alienactions.kick.loop = THREE.LoopOnce;
          alienactions.kick.clampWhenFinished = true;
        }
      });
     if (alienactions.idle) alienactions.idle.reset().play();

      // make sure matrices are updated so setFromObject gets correct world box
      alienplayer.updateMatrixWorld(true);

      // compute model bounding box (world coords)
      const playerBox = new THREE.Box3().setFromObject(alienplayer);
      // distance from the model origin to the model bottom (world units)
      // if player.position is 0, originToBottom ~= -playerBox.min.y
      const playerWorldPos = new THREE.Vector3();
      alienplayer.getWorldPosition(playerWorldPos);
      alienplayerOriginToBottom = playerWorldPos.y - playerBox.min.y;

      // Our base capsule dimensions (the values you used earlier)
      const baseRadius = 0.5;
      const baseHeight = 1.8;

      // Convert capsule dims to world units using mesh scale
      // (Assumes uniform scale on x,y,z)
      const meshScale = alienplayer.scale.y; // if scale is (5,5,5) we multiply by 5
      const radiusWorld = baseRadius * meshScale;
      const heightWorld = baseHeight * meshScale;

      // create capsule body (use your createCapsule but pass world dims)
      function createCapsuleWorld(radius, height) {
        const body = new CANNON.Body({ mass: 70 });
        const sphere = new CANNON.Sphere(radius);
        const cyl = new CANNON.Cylinder(radius, radius, height, 8);
        // bottom sphere
        body.addShape(sphere, new CANNON.Vec3(0, -height / 2, 0));
        // top sphere
        body.addShape(sphere, new CANNON.Vec3(0, height / 2, 0));
        // cylinder (Cannon cylinder orientation matches Three's default if you don't rotate)
        body.addShape(cyl); // note: if you see rotation issues you can rotate the cylinder via offsets/quaternions
        return body;
      }

      alienplayerBody = createCapsuleWorld(radiusWorld, heightWorld);

      // compute half-total: (height/2 + radius)
      alienplayerColliderHalfTotal = heightWorld / 2 + radiusWorld;

      // spawn the capsule so its BOTTOM touches the ground top
      alienplayerBody.position.set(0, groundTopY + alienplayerColliderHalfTotal, 0);
      alienplayerBody.fixedRotation = true;
      alienplayerBody.updateMassProperties();
      world.addBody(alienplayerBody);

      // Optional: player material contact with ground
      const playerMat = new CANNON.Material("alienplayer");
      alienplayerBody.material = playerMat;
      if (groundBody) {
        const contactPG = new CANNON.ContactMaterial(playerMat, groundBody.material || new CANNON.Material("ground"), {
          friction: 0.6,
          restitution: 0.0,
        });
        world.addContactMaterial(contactPG);
      }

      // log some values to debug if something still off
     // console.log("alienGROUND TOP Y:", groundTopY);
     // console.log("alienplayerOriginToBottom:", alienplayerOriginToBottom);
     // console.log("alienplayerColliderHalfTotal (world):", alienplayerColliderHalfTotal);
     // console.log("alienballRadiusWorld (if already set):", ballRadiusWorld);

    },
    undefined,
    (err) => console.error("alien Player loading error:", err)
  );
}


function loadPlayer() {
  loader.load("/models/player.glb",
    (gltf) => {
      player = gltf.scene;
      // Keep same visual scale as before
      player.scale.set(5, 5, 5);
      player.position.set(0, 0, 0);
      player.castShadow = true;    // player casts shadows
          player.receiveShadow = true;
      scene.add(player);

      // animations...
      mixer = new THREE.AnimationMixer(player);
      gltf.animations.forEach((clip) => {
        //console.log(clip.name,clip.duration)
        const name = clip.name.toLowerCase();
        if (name.includes("fastrun")) {
          actions.fastrun = mixer.clipAction(clip);
          actions.fastrun.loop = THREE.LoopRepeat;
        } else if (name.includes("idle")) {
          actions.idle = mixer.clipAction(clip);
          actions.idle.loop = THREE.LoopRepeat;
        }else if (name.includes("pass")) {
          clip = THREE.AnimationUtils.subclip(clip, "pass", 70, 110); // frames
          actions.pass = mixer.clipAction(clip);
          actions.pass.loop = THREE.LoopOnce;
          actions.pass.clampWhenFinished = true;
        } else if (name.includes("kick")) {
          clip = THREE.AnimationUtils.subclip(clip, "kick", 110, 170); // frames
          actions.kick = mixer.clipAction(clip);
          actions.kick.loop = THREE.LoopOnce;
          actions.kick.clampWhenFinished = true;
        }else if (name.includes("tackle")) {
        // If tackle anim includes forward translation, cut it to be "in place"
  clip = clip.clone();
  clip.tracks = clip.tracks.filter(track => !track.name.endsWith(".position")); 
  actions.tackle = mixer.clipAction(clip);
  actions.tackle.loop = THREE.LoopOnce;
  actions.tackle.clampWhenFinished = true;
        }
      });
     if (actions.idle) actions.idle.reset().play();

      // make sure matrices are updated so setFromObject gets correct world box
      player.updateMatrixWorld(true);

      // compute model bounding box (world coords)
      const playerBox = new THREE.Box3().setFromObject(player);
      // distance from the model origin to the model bottom (world units)
      // if player.position is 0, originToBottom ~= -playerBox.min.y
      const playerWorldPos = new THREE.Vector3();
      player.getWorldPosition(playerWorldPos);
      playerOriginToBottom = playerWorldPos.y - playerBox.min.y;

      // Our base capsule dimensions (the values you used earlier)
      const baseRadius = 0.5;
      const baseHeight = 1.8;

      // Convert capsule dims to world units using mesh scale
      // (Assumes uniform scale on x,y,z)
      const meshScale = player.scale.y; // if scale is (5,5,5) we multiply by 5
      const radiusWorld = baseRadius * meshScale;
      const heightWorld = baseHeight * meshScale;

      // create capsule body (use your createCapsule but pass world dims)
      function createCapsuleWorld(radius, height) {
        const body = new CANNON.Body({ mass: 70 });
        const sphere = new CANNON.Sphere(radius);
        const cyl = new CANNON.Cylinder(radius, radius, height, 8);
        // bottom sphere
        body.addShape(sphere, new CANNON.Vec3(0, -height / 2, 0));
        // top sphere
        body.addShape(sphere, new CANNON.Vec3(0, height / 2, 0));
        // cylinder (Cannon cylinder orientation matches Three's default if you don't rotate)
        body.addShape(cyl); // note: if you see rotation issues you can rotate the cylinder via offsets/quaternions
        return body;
      }

      playerBody = createCapsuleWorld(radiusWorld, heightWorld);

      // compute half-total: (height/2 + radius)
      playerColliderHalfTotal = heightWorld / 2 + radiusWorld;

      // spawn the capsule so its BOTTOM touches the ground top
      playerBody.position.set(0, groundTopY + playerColliderHalfTotal, 0);
      playerBody.fixedRotation = true;
      playerBody.updateMassProperties();
      world.addBody(playerBody);

      // Optional: player material contact with ground
      const playerMat = new CANNON.Material("player");
      playerBody.material = playerMat;
      if (groundBody) {
        const contactPG = new CANNON.ContactMaterial(playerMat, groundBody.material || new CANNON.Material("ground"), {
          friction: 0.6,
          restitution: 0.0,
        });
        world.addContactMaterial(contactPG);
      }

      // log some values to debug if something still off
      //console.log("GROUND TOP Y:", groundTopY);
      //console.log("playerOriginToBottom:", playerOriginToBottom);
      //console.log("playerColliderHalfTotal (world):", playerColliderHalfTotal);
      //console.log("ballRadiusWorld (if already set):", ballRadiusWorld);

    },
    undefined,
    (err) => console.error("Player loading error:", err)
  );
}
// --- PASS / KICK FUNCTIONS ---
function fadeToAction(name, duration = 0.2) {
  if (!actions[name]) {
    console.log("no action for", name);
    return;
  }

  const nextAction = actions[name];
  if (currentAction === nextAction) {
    //console.log("already playing", currentAction._clip.name);
    return;
  }

  if (currentAction) {
    //console.log("fading out", currentAction._clip.name);
    currentAction.fadeOut(duration);

  }

  // 🔑 reset the clip completely
  nextAction.reset();
  nextAction.paused = false;
  nextAction.enabled = true;
  nextAction.time = 0;

  // One-shots (kick, pass) must not loop
 // if (name === "kick" || name === "pass") {
   // nextAction.setLoop(THREE.LoopRepeat, Infinity);
   // nextAction.clampWhenFinished = false;
  //} else {
   // nextAction.setLoop(THREE.LoopRepeat, Infinity);
   // nextAction.clampWhenFinished = false;
  //}

 // nextAction.fadeIn(duration).play();
nextAction.fadeIn(duration).play();
  currentAction = nextAction;
  currentState = name;
 // console.log("switched to", name);
  //if(isKicking){
  //  isKicking=false
  //}
  // if(isPassing){
   // isPassing=false
  //}
}

function fadeToalienAction(name, duration = 0.2) {
  if (!alienactions[name]) {
    console.log("no action for", name);
    return;
  }

  const nextAction = alienactions[name];
  if (aliencurrentAction === nextAction) {
    //console.log("already playing", currentAction._clip.name);
    return;
  }

  if (aliencurrentAction) {
    //console.log("fading out", currentAction._clip.name);
    aliencurrentAction.fadeOut(duration);

  }

  // 🔑 reset the clip completely
  nextAction.reset();
  nextAction.paused = false;
  nextAction.enabled = true;
  nextAction.time = 0;

  // One-shots (kick, pass) must not loop
 // if (name === "kick" || name === "pass") {
   // nextAction.setLoop(THREE.LoopRepeat, Infinity);
   // nextAction.clampWhenFinished = false;
  //} else {
   // nextAction.setLoop(THREE.LoopRepeat, Infinity);
   // nextAction.clampWhenFinished = false;
  //}

 // nextAction.fadeIn(duration).play();
nextAction.fadeIn(duration).play();
  aliencurrentAction = nextAction;
  aliencurrentState = name;
 // console.log("switched to", name);
  //if(isKicking){
  //  isKicking=false
  //}
  // if(isPassing){
   // isPassing=false
  //}
}
function handlealienKick() {
  if (!alienplayer || !ballBody) return;
isalienKicking = true
  const forward = new CANNON.Vec3(
    Math.sin(alienplayer.rotation.y),
    0,
    Math.cos(alienplayer.rotation.y)
  );

  const power = 150, lift = 15;
  const distance = alienplayerBody.position.vsub(ballBody.position).length();

  fadeToalienAction("kick", 0.1);
   if (distance < 7.35) {
    setTimeout(() => {
      ballBody.velocity.set(forward.x * power, lift, forward.z * power);
    }, 330); // 2 second delay
  }
}

function handlealienPass() {
  if (!alienplayer || !ballBody) return;
isalienPassing = true
  const forward = new CANNON.Vec3(
    Math.sin(alienplayer.rotation.y),
    0,
    Math.cos(alienplayer.rotation.y)
  );

  const power = 30;
  const distance = alienplayerBody.position.vsub(ballBody.position).length();
 

  fadeToalienAction("pass", 0.1);
  if (distance < 7.35) {
    setTimeout(() => {
      ballBody.velocity.set(forward.x * power, 0, forward.z * power);
    }, 400); // 2 second delay
  }
}

function handleKick() {
  if (!player || !ballBody) return;
isKicking = true
  const forward = new CANNON.Vec3(
    Math.sin(player.rotation.y),
    0,
    Math.cos(player.rotation.y)
  );

  const power = 150, lift = 15;
  const distance = playerBody.position.vsub(ballBody.position).length();

  fadeToAction("kick", 0.1);
   if (distance < 7.35) {
    setTimeout(() => {
      ballBody.velocity.set(forward.x * power, lift, forward.z * power);
    }, 330); // 2 second delay
  }
}

function handlePass() {
  if (!player || !ballBody) return;
isPassing = true
  const forward = new CANNON.Vec3(
    Math.sin(player.rotation.y),
    0,
    Math.cos(player.rotation.y)
  );

  const power = 30;
  const distance = playerBody.position.vsub(ballBody.position).length();
 

  fadeToAction("pass", 0.1);
  if (distance < 7.35) {
    setTimeout(() => {
      ballBody.velocity.set(forward.x * power, 0, forward.z * power);
    }, 400); // 2 second delay
  }
}

function handleTackle() {
  if (!playerBody || !player) return;

  fadeToAction("tackle", 0.1);

  const forward = new CANNON.Vec3(
    Math.sin(player.rotation.y),
    0,
    Math.cos(player.rotation.y)
  );

  const tacklePower = 60;
  playerBody.velocity.x = forward.x * tacklePower;
  playerBody.velocity.z = forward.z * tacklePower;
}


// 2. Add invisible goal zones for scoring
function addGoalZone(
  name,
  x,
  z,
  width = 20,
  height = 10,
  depth = 5,
  color = 0xffff00
) {
  const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
  const body = new CANNON.Body({ mass: 0, collisionResponse: false });
  body.addShape(shape);
  body.position.set(x, groundTopY + height / 2, z);

  // ✅ rotate 90° around Y for Cannon body
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), (2*Math.PI) / 2);

  body.name = name;
  world.addBody(body);
  goalZones.push(body);

  // ✅ Visible goal zone (rotated too)
  const mat = new THREE.MeshBasicMaterial({
    color: color,
    opacity: 0.3,
    transparent: true,
    visible:false
  });
  const geom = new THREE.BoxGeometry(width, height, depth);
  const debug = new THREE.Mesh(geom, mat);
  debug.position.copy(body.position);

  // rotate the debug mesh
  //debug.rotation.y = Math.PI / 2;

  scene.add(debug);
}



function addGoalBlocker(goalBody, offsetZ = 3, width = 4, height = 3, depth = 1, color = 0xff0000) {
  const y = groundTopY + height / 2;
  const startX = goalBody.position.x;
  const z = goalBody.position.z + offsetZ;

  // --- Physics ---
  const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
  const body = new CANNON.Body({ mass: 0 }); // static mass but we'll move manually
  body.addShape(shape);
  body.position.set(startX, y, z);
  world.addBody(body);

  // --- Visual ---
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(body.position);
  scene.add(mesh);

  // store for animation
  blockers.push({ body, mesh, baseX: startX, amplitude: 10 + Math.random() * 5, speed: 1 + Math.random() });
}




// 3. Simple HTML scoreboard
scoreDiv = document.createElement("div");
scoreDiv.style.position = "absolute";
scoreDiv.style.top = "20px";
scoreDiv.style.left = "50%";
scoreDiv.style.transform = "translateX(-50%)";
scoreDiv.style.fontSize = "32px";
scoreDiv.style.color = "white";
scoreDiv.style.fontFamily = "Arial, sans-serif";
scoreDiv.innerText = `Score: ${score}`;
document.body.appendChild(scoreDiv);

// --- check goals inside animate loop
function checkGoals() {
  if (!ballBody) return;

  for (const goal of goalZones) {
    const dx = Math.abs(ballBody.position.x - goal.position.x);
    const dy = Math.abs(ballBody.position.y - goal.position.y);
    const dz = Math.abs(ballBody.position.z - goal.position.z);

    const half = goal.shapes[0].halfExtents;
    if (dx <= half.x && dy <= half.y && dz <= half.z) {
      score++;
      scoreDiv.innerText = `Score: ${score}`;
      //console.log("GOAL!", goal.name);

      // trigger net animation
      const netMesh = goal.name === "goal1"
        ? stadium.getObjectByName("net1")
        : stadium.getObjectByName("net2");
      if (netMesh) {
        netAnims.push({ mesh: netMesh, time: 0 });
      }

      // reset ball
      ballBody.position.set(0, groundTopY + ballRadiusWorld + 1, 0);
      ballBody.velocity.set(0, 0, 0);
      ballBody.angularVelocity.set(0, 0, 0);
    }
  }
  if (score>0) {
  if (currentLevel < 3) {
    currentLevel++;
    score=0
    loadLevel(currentLevel);
  } else {
    alert("🏆 You completed all levels!");
  }
}
}

// === AI SETTINGS ===
const alienRunSpeed = 10; // movement speed
const alienBallGrabDist = 5; // distance to "own" the ball
const alienKickDist = 12; // distance from goal to kick

// Which goalpost alien should score on (set this to your second goalpost object)
//let secondGoalPos = new THREE.Vector3(0, 0, 50); // adjust to match your scene

function updateAlienAI(delta) {
  if (!alienplayer || !alienplayerBody || !ballBody) return;

  // Positions
  const alienPos = alienplayerBody.position.clone();
  const ballPos = ballBody.position.clone();

  // Vector towards ball
  const toBall = ballPos.vsub(alienPos);
  const distToBall = toBall.length();

  // Decide target
  let target;
  if (distToBall > alienBallGrabDist) {
    // Chase the ball
    target = ballPos;
  } else {
    // Alien "has the ball", run towards goal
    target = new CANNON.Vec3(secondGoalPos.x, alienPos.y, secondGoalPos.z);

    // Check if close enough to goal to shoot
    const toGoal = target.vsub(alienPos);
    if (toGoal.length() < alienKickDist) {
      handlealienKick();
    }
  }

  // Direction to target
  const dir = target.vsub(alienPos);
  dir.y = 0; // stay on ground plane
  const len = dir.length();
  if (len > 0.01) {
    dir.normalize();

    // Move alien body (basic velocity control)
    alienplayerBody.velocity.x = dir.x * alienRunSpeed;
    alienplayerBody.velocity.z = dir.z * alienRunSpeed;

    // Rotate alien to face direction
    alienplayer.rotation.y = Math.atan2(dir.x, dir.z);

    // Play run animation
    fadeToalienAction("fastrun", 0.2);
  } else {
    // Idle if no movement
    alienplayerBody.velocity.x = 0;
    alienplayerBody.velocity.z = 0;
    fadeToalienAction("idle", 0.2);
  }
}

// CONTROLS
const keys = {
  w: false,
  s: false,
  a: false,
  d: false,
  p: false,
  k: false,
  c:false
};

window.addEventListener("keydown", (e) => {
  if (e.key in keys) keys[e.key] = true;
  if (e.key === "c") {
    cameraMode = (cameraMode + 1) % 3;
    switch (cameraMode) {
      case 0:
        updateFIFACamera()
        break;
      case 1:
        // Side view
        camera.position.set(100, 30, 0);
        camera.lookAt(0, 0, 0);
        break;
      case 2:
        // Top view
        camera.position.set(0, 150, 0);
        camera.lookAt(0, 0, 0);
        break;
    }
  }
});
const modal = document.getElementById('controlsModal');
const btn = document.getElementById('controlsButton');
const span = document.querySelector('.close');

btn.addEventListener('click', () => {
  modal.style.display = 'block';
});

span.addEventListener('click', () => {
  modal.style.display = 'none';
});

window.addEventListener('click', (event) => {
  if (event.target === modal) {
    modal.style.display = 'none';
  }
});


window.addEventListener("keyup", (e) => {
  if (e.key in keys) keys[e.key] = false;
   if (e.key === "p") {
    handlePass();
  
  }
  if (e.key === "k") {
    handleKick();
    
  }
  if (e.key === "t"){
handleTackle();
  }  

});

let gameStarted = false;
let gameOver = false;
let gameTime = 120; // 2 minutes in seconds
let timerInterval;

const timerDiv = document.getElementById("timerDiv");
const startScreen = document.getElementById("startScreen");
const gameOverDiv = document.getElementById("gameOverDiv");
const startBtn = document.getElementById("startBtn");

startBtn.addEventListener("click", startGame);
const bgMusic = document.getElementById('bgMusic');

function startGame() {
  startScreen.style.display = "none";
  timerDiv.style.display = "block";
  gameStarted = true;
  gameOver = false;
  gameTime = 300;
  score = 0;
  scoreDiv.innerText = "Score: 0";
  bgMusic.volume = 0.5; // optional: adjust volume (0.0 to 1.0)
  bgMusic.play().catch(err => {
    console.log("Autoplay blocked until user interaction:", err);
  });
  // reset ball
  if (ballBody) {
    ballBody.position.set(0, groundTopY + ballRadiusWorld + 1, 0);
    ballBody.velocity.set(0, 0, 0);
  }

  // start timer
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!gameStarted) return;
    gameTime--;
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    timerDiv.innerText = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;

    if (gameTime <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  gameStarted = false;
  gameOver = true;
  clearInterval(timerInterval);
  timerDiv.style.display = "none";
  gameOverDiv.style.display = "flex";
}

function restartGame() {
  gameOverDiv.style.display = "none";
  startScreen.style.display = "flex";
}


// PARAMETERS
const playerSpeed = 15;

const fifaOffset = new THREE.Vector3(0,15,-25)
const fifaLerp = 0.08;
function updateCameraFIFA() {
  if (!playerBody) return;

  // Get player's position from physics body
  const playerPos = new THREE.Vector3(
    playerBody.position.x,
    playerBody.position.y,
    playerBody.position.z
  );

  // Use player's facing direction (from mesh rotation if available)
  const forward = new THREE.Vector3(0, 0, 1);
  if (player) forward.applyQuaternion(player.quaternion);

  // Desired camera position (behind and above player)
  const desiredPos = playerPos.clone()
    .addScaledVector(forward, -25) // behind player
    .add(new THREE.Vector3(0, 15, 0)); // above player

  // Smoothly move camera toward desired position
  camera.position.lerp(desiredPos, fifaLerp);

  // Make camera look slightly ahead of the player
  const lookAtPos = playerPos.clone().addScaledVector(forward, 10);
  camera.lookAt(lookAtPos);
}
function animate() {
  requestAnimationFrame(animate);
if (!gameStarted || gameOver) return; // pause everything if not playing

  const delta = clock.getDelta();
  world.step(timeStep, delta);
  checkGoals();
if (playerBody && ballBody) {
    keepBallClose();
  }
   if (cameraMode === 0) {
    updateCameraFIFA();
  }
  if (playerBody) {
    let moveX = 0;
    let moveZ = 0;

    if (keys.w) moveZ -= 1;
    if (keys.s) moveZ += 1;
    if (keys.a) moveX -= 1;
    if (keys.d) moveX += 1;

    const length = Math.hypot(moveX, moveZ);
    if (length > 0) {
      moveX /= length; // normalize
      moveZ /= length;

      // ✅ directly set velocity instead of force
      playerBody.velocity.x = moveX * playerSpeed;
      playerBody.velocity.z = moveZ * playerSpeed;

      // ✅ rotate player to face movement
      const angle = Math.atan2(moveX, moveZ);
      if (player) {
        player.rotation.y = angle;
      }
    } else {
      // stop player gradually
      playerBody.velocity.x *= 0.9;
      playerBody.velocity.z *= 0.9;
    }
  }

  // Sync player visual with physics
  if (player && playerBody) {
    player.position.copy(playerBody.position);
    //player.quaternion.copy(playerBody.quaternion);

    // compute capsule bottom world Y
    const capsuleBottomY = playerBody.position.y - playerColliderHalfTotal;

    // place the player mesh such that its bottom (mesh) sits on capsuleBottomY
    // playerOriginToBottom is the distance from mesh origin to the mesh bottom (world units)
    player.position.y = capsuleBottomY + playerOriginToBottom;
    //player.position.y -= 0.5; 
  }

  // Sync ball
  if (ball && ballBody) {
    ball.position.copy(ballBody.position);
    ball.quaternion.copy(ballBody.quaternion);
  }
   if (debugGround && groundBody) {
    debugGround.position.copy(groundBody.position);
    debugGround.quaternion.copy(groundBody.quaternion);
  }

  // ✅ Animation switching
  const isMoving =  keys.w || keys.s || keys.a || keys.d;


 if (mixer) {
  if (actions.idle && actions.fastrun) {
    const isMoving = keys.w || keys.s || keys.d || keys.a;
    
    if (currentState !== "kick" && currentState !== "pass" && currentState !== "tackle") {
      if (isMoving) {
        fadeToAction("fastrun", 0.3);
      } else {
        fadeToAction("idle", 0.3);
      }
    }
  }

  mixer.update(delta);

  // if we’re in a one-shot (kick/pass), check if it ended
  if ((currentState === "kick" || currentState === "pass" || currentState === "tackle") && currentAction.time >= currentAction.getClip().duration) {
    const isMoving = keys.w || keys.s || keys.a || keys.d;
   fadeToAction(isMoving ? "fastrun" : "idle", 0.3);
 }
 

}
if (keeperBody && keeperBody.userData.debugMesh) {
  keeperBody.userData.debugMesh.position.copy(keeperBody.position);
  keeperBody.userData.debugMesh.quaternion.copy(keeperBody.quaternion);
}

if (keeperMixer) keeperMixer.update(clock.getDelta());

if (humankeeperBody && humankeeperBody.userData.debugMesh) {
  humankeeperBody.userData.debugMesh.position.copy(humankeeperBody.position);
  humankeeperBody.userData.debugMesh.quaternion.copy(humankeeperBody.quaternion);
}

if (humankeeperMixer) humankeeperMixer.update(clock.getDelta());

if (ballBody) {updateKeeperAI(ballBody,delta)
  updateHumanKeeperAI(ballBody,delta)
};
if (alienmixer) alienmixer.update(delta);

updateAlienAI(delta);
const elapsed = performance.now() * 0.001; // seconds
blockers.forEach((b, i) => {
  const xOffset = Math.sin(elapsed * b.speed + i) * b.amplitude;
  const newX = b.baseX + xOffset;

  b.body.position.x = newX;
  b.mesh.position.copy(b.body.position);

  // Keep physics velocity zero since we teleport manually
  b.body.velocity.set(0, 0, 0);
});
 
  renderer.render(scene, camera);
}


animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});






//import * as THREE from "three"; import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"; import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x6789); const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 ); camera.position.set(0, 30, 100); camera.lookAt(0, 0, 0); const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight); document.body.appendChild(renderer.domElement); const light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(30, 50, 30); scene.add(light); scene.add(new THREE.AmbientLight(0xffffff, 0.5)); const loader = new GLTFLoader(); let stadium, ball, player, mixer, actions = {}; const clock = new THREE.Clock(); loader.load("/models/stadium.glb", (gltf) => { stadium = gltf.scene; stadium.scale.set(10, 5, 10); stadium.position.set(0, 0, 0); stadium.rotation.y = Math.PI / 2; scene.add(stadium); loadBall(); loadPlayer(); }); function loadBall() { loader.load("/models/ball.glb", (gltf) => { ball = gltf.scene; ball.scale.set(0.8, 0.8, 0.8); ball.position.set(4, 1.71, 0); scene.add(ball); }, undefined, (err) => console.error("Ball loading error:", err)); } function loadPlayer() { loader.load("/models/player.glb", (gltf) => { player = gltf.scene; player.scale.set(4, 4, 4); player.position.set(0, 0.99, 0); // Start a bit away from ball scene.add(player); // Setup animations mixer = new THREE.AnimationMixer(player); gltf.animations.forEach((clip) => { if (clip.name.toLowerCase().includes("slowrun")) { actions.slowrun = mixer.clipAction(clip); actions.slowrun.play(); } }); }, undefined, (err) => console.error("Player loading error:", err)); } // Controls const keys = { w: false, s: false, a: false, d: false }; window.addEventListener("keydown", (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; }); window.addEventListener("keyup", (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; }); // Player movement parameters const playerSpeed = 0.25; const ballMoveForce = 0.5; const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.25; controls.screenSpacePanning = false; function animate() { requestAnimationFrame(animate); const delta = clock.getDelta(); if (mixer) { // Check if any movement key is pressed const isMoving = keys.w || keys.s || keys.a || keys.d; if (actions.slowrun) { actions.slowrun.paused = !isMoving; // Pause when no input, play when moving if (!actions.slowrun.isRunning() && isMoving) { actions.slowrun.play(); } } mixer.update(delta); } if (player && ball) { let moveX = 0, moveZ = 0; if (keys.w) moveZ -= playerSpeed; if (keys.s) moveZ += playerSpeed; if (keys.a) moveX -= playerSpeed; if (keys.d) moveX += playerSpeed; // Move player player.position.x += moveX; player.position.z += moveZ; // Rotate player to face movement direction if moving if (moveX !== 0 || moveZ !== 0) { const angle = Math.atan2(moveX, moveZ); player.rotation.y = angle; } // Check collision with ball (simple distance check) const distance = player.position.distanceTo(ball.position); const collisionDistance = 3; // Adjust depending on player/ball sizes if (distance < collisionDistance) { // Calculate small force vector based on player movement const forceVector = new THREE.Vector3(moveX, 0, moveZ).normalize().multiplyScalar(ballMoveForce); ball.position.add(forceVector); // Keep ball on ground level ball.position.y = 1; } } controls.update(); renderer.render(scene, camera); } animate(); window.addEventListener("resize", () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }); In that code the stadium is a soccer fields extract ground named ground from blender, firstgoal for first goalpost and secondgoal for the 2nd one. the the ball and player must not pass through the ground. use cannon to put physics to the ball. the player and ball must not pass through the goalposts they can enter but not go through it. use cannon to put physics between the player, the ball and field. the player has two animations from blender slowrun and idle. when the player is not controlled by controls play the idle animatition otherwise keep slowrun animation.