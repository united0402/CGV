import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as CANNON from "cannon-es";
import { DRACOLoader } from "three/examples/jsm/Addons.js";

// SCENE SETUP
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6789);

let cameraMode = 0;
const cameraOffset = new THREE.Vector3(0, 15, -25);
const cameraLerpFactor = 0.1;
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(50, 100, 50);
light.castShadow = true;
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
world.solver.iterations = 8;
world.solver.tolerance = 0.001;

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/');
loader.setDRACOLoader(dracoLoader);

let stadium, ball, player, alienplayer, mixer, alienmixer;
let actions = {}, alienactions = {};
let playerBody, alienplayerBody, ballBody, keeperBody, humankeeperBody;
let currentState = "idle";
let currentAction = null;
let aliencurrentState = "idle";
let aliencurrentAction = null;

// Possession and movement variables
let playerHasBall = false;
let possessionOffset = 8;
let possessionRadius = 5.0;
const playerAccel = 12.0;
const playerVelLerp = 0.18;
let desiredPlayerVel = new CANNON.Vec3(0, 0, 0);

const clock = new THREE.Clock();
let groundTopY = 0;
let groundBody, debugGround;
let playerOriginToBottom = 0;
let playerColliderHalfTotal = 0;
let alienplayerOriginToBottom = 0;
let alienplayerColliderHalfTotal = 0;
let ballRadiusWorld = 0;
let score = 0;
let scoreDiv;
let goalZones = [];
let secondGoalPos;
let isPassing = false;
let isKicking = false;
let isalienPassing = false;
let isalienKicking = false;
let goal1Body, goal2Body;
const blockers = [];
let firstPost, secondPost;
let keeper, keeperMixer, keeperActions = {}, currentKeeperAction, currentKeeperState;
let humankeeper, humankeeperMixer, humankeeperActions = {}, currentHumanKeeperAction, currentHumanKeeperState;
let netAnims = [];
let currentLevel = 1;
let maxKeeperSpeed = 0.5;
let levelConfig = {
  1: { name: "Easy", numBlocks: 0, keeperSpeed: 0.5 },
  2: { name: "Medium", numBlocks: 2, keeperSpeed: 0.5 },
  3: { name: "Hard", numBlocks: 4, keeperSpeed: 8 },
};

// Crowd animation uniforms
let crowdUniforms1 = null;
let crowdUniforms2 = null;

// STADIUM LOADING
loader.load("/models/stadium.glb", (gltf) => {
  stadium = gltf.scene;
  stadium.scale.set(5, 5, 5);
  stadium.position.set(0, 0, 0);
  stadium.rotation.y = Math.PI / 2;
  scene.add(stadium);

  // Setup crowd animations
  const stands = stadium.getObjectByName("stands2");
  const stands2 = stadium.getObjectByName("stands3");

  if (stands2) {
    const crowdTexture = new THREE.TextureLoader().load("/models/crowd2.png");
    crowdTexture.wrapS = crowdTexture.wrapT = THREE.RepeatWrapping;
    crowdTexture.repeat.set(2, 1);

    crowdUniforms1 = {
      time: { value: 0 },
      tex: { value: crowdTexture },
    };

    stands2.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.ShaderMaterial({
          uniforms: crowdUniforms1,
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
              float wave = sin(vUv.x * 20.0 + time * 3.0) * 0.15 + sin(vUv.y * 15.0 + time * 2.0) * 0.1;
              float flicker = (fract(sin(dot(vUv.xy * 200.0, vec2(12.9898,78.233))) * 43758.5453 + time) - 0.5) * 0.3;
              float brightness = 0.8 + wave + flicker;
              gl_FragColor = vec4(texColor.rgb * brightness, texColor.a);
            }
          `,
        });
      }
    });
  }

  if (stands) {
    const crowdTexture = new THREE.TextureLoader().load("/models/crowd2.png");
    crowdTexture.wrapS = crowdTexture.wrapT = THREE.RepeatWrapping;
    crowdTexture.repeat.set(2, 1);

    crowdUniforms2 = {
      time: { value: 0 },
      tex: { value: crowdTexture },
    };

    stands.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.ShaderMaterial({
          uniforms: crowdUniforms2,
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
              float wave = sin(vUv.x * 20.0 + time * 3.0) * 0.15 + sin(vUv.y * 15.0 + time * 2.0) * 0.1;
              float flicker = (fract(sin(dot(vUv.xy * 200.0, vec2(12.9898,78.233))) * 43758.5453 + time) - 0.5) * 0.3;
              float brightness = 0.8 + wave + flicker;
              gl_FragColor = vec4(texColor.rgb * brightness, texColor.a);
            }
          `,
        });
      }
    });
  }

  stadium.updateMatrixWorld(true);
  firstPost = stadium.getObjectByName("firstpost");
  secondPost = stadium.getObjectByName("secondpost");
  const lines = stadium.getObjectByName("lines");
  const ground2 = stadium.getObjectByName("secondground");

  if (lines) lines.visible = false;
  if (ground2) ground2.visible = false;
  if (firstPost) firstPost.visible = false;
  if (secondPost) secondPost.visible = false;

  // Find ground mesh
  const groundMesh = stadium.getObjectByName("ground");
  if (groundMesh) {
    groundMesh.receiveShadow = true;
    groundMesh.visible = false;

    const groundBox = new THREE.Box3().setFromObject(groundMesh);
    const groundSize = new THREE.Vector3();
    groundBox.getSize(groundSize);
    const groundCenter = new THREE.Vector3();
    groundBox.getCenter(groundCenter);

    groundTopY = groundBox.max.y;

    const thickness = 8;
    const halfExtents = new CANNON.Vec3(groundSize.x / 2, thickness / 2, groundSize.z / 2);
    const shape = new CANNON.Box(halfExtents);
    groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(shape);
    groundBody.position.set(groundCenter.x, groundTopY - thickness / 2, groundCenter.z);
    world.addBody(groundBody);

    const gm = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: false });
    const geom = new THREE.BoxGeometry(groundSize.x, thickness, groundSize.z);
    debugGround = new THREE.Mesh(geom, gm);
    debugGround.position.copy(groundBody.position);
    scene.add(debugGround);

    const fieldWidth = groundSize.x;
    const fieldDepth = groundSize.z;
    const goalOffsetZ = fieldDepth / 2 + 0.01;

    addGoalZone("goal1", groundCenter.x, groundCenter.z - goalOffsetZ, 30, 10, 5, 0xffaa00);
    addGoalZone("goal2", groundCenter.x, groundCenter.z + goalOffsetZ, 20, 10, 5, 0x00aaff);

    goalZones.forEach((gz) => {
      if (gz.name === "goal1") goal1Body = gz;
      if (gz.name === "goal2") goal2Body = gz;
    });

    if (goal2Body) {
      secondGoalPos = new THREE.Vector3(goal2Body.position.x, groundTopY, goal2Body.position.z);
    }
  } else {
    console.warn("Ground mesh named 'ground' not found in stadium.glb");
  }

  loadKeeper();
  loadBall();
  loadPlayer();
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

function loadKeeper() {
  loader.load("/models/humankeeper.glb", (gltf) => {
    keeper = gltf.scene;
    keeper.scale.set(5, 5, 5);
    keeper.position.set(0, groundTopY, -20);
    scene.add(keeper);

    keeperMixer = new THREE.AnimationMixer(keeper);
    gltf.animations.forEach((clip) => {
      const name = clip.name.toLowerCase();
      if (name.includes("idle")) {
        keeperActions.idle = keeperMixer.clipAction(clip);
        keeperActions.idle.loop = THREE.LoopRepeat;
        keeperActions.idle.timeScale = 20;
      } else if (name.includes("bodyblockright")) {
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
      }
    });

    if (keeperActions.idle) keeperActions.idle.reset().play();

    const keeperHalfWidth = 0.8 * keeper.scale.x;
    const keeperHeight = 1.8 * keeper.scale.y;

    keeperBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      position: new CANNON.Vec3(keeper.position.x, keeper.position.y, keeper.position.z),
    });

    const box = new CANNON.Box(new CANNON.Vec3(keeperHalfWidth, keeperHeight * 1.8, keeperHalfWidth));
    keeperBody.addShape(box);
    keeper.userData.physicsBody = keeperBody;
    keeperBody.userData = { three: keeper };
    world.addBody(keeperBody);

    if (goalZones[0]) {
      placeKeeperAtGoal(goalZones[0], -2);
      keeperBody.position.set(keeper.position.x, keeper.position.y, keeper.position.z);
    }

    const debugGeometry = new THREE.BoxGeometry(keeperHalfWidth, keeperHeight * 1.8, keeperHalfWidth);
    const debugMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
      visible: false
    });
    const keeperDebugMesh = new THREE.Mesh(debugGeometry, debugMaterial);
    scene.add(keeperDebugMesh);
    keeperBody.userData.debugMesh = keeperDebugMesh;
  });
}

function loadLevel(levelNum) {
  const level = levelConfig[levelNum];
  if (!level) return;

  maxKeeperSpeed = level.keeperSpeed;

  blockers.forEach(b => {
    scene.remove(b.mesh);
    world.removeBody(b.body);
  });
  blockers.length = 0;

  for (let i = 0; i < level.numBlocks; i++) {
    const w = 5;
    const h = 8;
    const d = 6;
    const color = i % 2 === 0 ? 0x00ff88 : 0xff4444;
    addGoalBlocker(goalZones[0], 20, h, d, 1, color);
  }

  levelLabel.textContent = `Level: ${level.name}`;
}

function placeKeeperAtGoal(goalZoneBody, offset = 4) {
  if (!keeper || !goalZoneBody) return;

  const goalPos = goalZoneBody.position;
  const forward = new CANNON.Vec3(0, 0, 1);
  goalZoneBody.quaternion.vmult(forward, forward);

  keeper.position.set(
    goalPos.x + forward.x * offset,
    groundTopY,
    goalPos.z + forward.z * offset
  );
}

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

function updateKeeperAI(ballBody, delta) {
  if (!keeper || !keeper.userData.physicsBody || !ballBody) return;

  const keeperPos = new THREE.Vector3();
  keeper.getWorldPosition(keeperPos);

  const ballPos = new THREE.Vector3(ballBody.position.x, ballBody.position.y, ballBody.position.z);

  const dx = ballPos.x - keeperPos.x;
  const dz = ballPos.z - keeperPos.z;
  const horizontalDist = Math.hypot(dx, dz);

  const maxSpeed = maxKeeperSpeed;
  let vx = 0, vz = 0;
  if (horizontalDist > 0.1) {
    vx = (dx / horizontalDist) * Math.min(maxSpeed, horizontalDist / Math.max(delta, 1e-6)) * delta;
    vz = (dz / horizontalDist) * Math.min(maxSpeed, horizontalDist / Math.max(delta, 1e-6)) * delta;
  }

  let newX = keeper.position.x + vx;
  let newZ = keeper.position.z + vz;

  if (goalZones && goalZones.length > 0) {
    let g = goalZones[0];
    let minDist = keeper.position.distanceTo(new THREE.Vector3(g.position.x, g.position.y, g.position.z));
    for (const goal of goalZones) {
      const d = keeper.position.distanceTo(new THREE.Vector3(goal.position.x, goal.position.y, goal.position.z));
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
      const depth = 3;
      newZ = THREE.MathUtils.clamp(newZ, goalZ - depth, goalZ + depth);
    }
  }

  keeper.position.set(newX, groundTopY, newZ);

  const kb = keeper.userData.physicsBody;
  kb.position.set(newX, groundTopY, newZ);
  kb.velocity.set(0, 0, 0);

  const kickRange = 3;
  if (horizontalDist < kickRange) {
    fadeToKeeperAction("kick");

    const kickPower = 25;
    const keeperDir = new THREE.Vector3(0, 0, -1).applyQuaternion(keeper.quaternion).normalize();

    ballBody.velocity.set(keeperDir.x * kickPower, 6, keeperDir.z * kickPower);
    return;
  }

  if (horizontalDist < 8 && Math.random() < 0.03) {
    fadeToKeeperAction(Math.random() > 0.5 ? "bodyblockright" : "bodyblockleft");
  } else {
    fadeToKeeperAction("idle");
  }
}

function keepBallClose() {
  if (!playerBody || !ballBody || !player) return;

  const playerPos = playerBody.position;
  const ballPos = ballBody.position;

  const dx = playerPos.x - ballPos.x;
  const dz = playerPos.z - ballPos.z;
  const dist = Math.hypot(dx, dz);

  const ballSpeed = Math.hypot(ballBody.velocity.x, ballBody.velocity.z);
  if (!playerHasBall && dist < possessionRadius && ballSpeed < 3 && 
      currentState !== "kick" && currentState !== "pass" && currentState !== "tackle") {
    playerHasBall = true;
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
  }

  if (playerHasBall) {
    const forward = new CANNON.Vec3(
      Math.sin(player.rotation.y || 0),
      0,
      Math.cos(player.rotation.y || 0)
    );
    ballBody.position.set(
      playerBody.position.x + forward.x * possessionOffset,
      groundTopY + ballRadiusWorld + 0.2,
      playerBody.position.z + forward.z * possessionOffset
    );
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
  } else {
    const isMoving = keys.w || keys.s || keys.a || keys.d;
    if (!isMoving && dist < 3.5 && ballSpeed < 2) {
      ballBody.velocity.x = 0;
      ballBody.velocity.z = 0;
      ballBody.angularVelocity.set(0, 0, 0);
    }
  }
}

function loadBall() {
  loader.load("/models/ball.glb", (gltf) => {
    ball = gltf.scene;
    ball.scale.set(5, 5, 5);
    scene.add(ball);

    ball.updateMatrixWorld(true);

    const ballBox = new THREE.Box3().setFromObject(ball);
    const ballSize = new THREE.Vector3();
    ballBox.getSize(ballSize);
    ballRadiusWorld = Math.max(ballSize.x, ballSize.y, ballSize.z) / 2;

    const ballShape = new CANNON.Sphere(ballRadiusWorld);
    ballBody = new CANNON.Body({
      mass: 1,
      position: new CANNON.Vec3(0, groundTopY + ballRadiusWorld + 0.01, 0),
      linearDamping: 0.4,
      angularDamping: 0.4,
    });
    ballBody.addShape(ballShape);
    world.addBody(ballBody);

    const ballMat = new CANNON.Material("ball");
    const groundMat = new CANNON.Material("ground");
    ballBody.material = ballMat;
    if (groundBody) groundBody.material = groundMat;
    const contact = new CANNON.ContactMaterial(ballMat, groundMat, {
      friction: 0.4,
      restitution: 0.1,
    });
    world.addContactMaterial(contact);

    ball.position.copy(ballBody.position);

    // Fixed collision listener
    ballBody.addEventListener("collide", (e) => {
      if (keeper && keeper.userData.physicsBody && e.body === keeper.userData.physicsBody) {
        const impactForce = ballBody.velocity.length();

        if (keeperActions["catch"] && keeperActions["catch"].isRunning()) {
          ballBody.velocity.set(0, 0, 0);
          ballBody.angularVelocity.set(0, 0, 0);

          const keeperWorldPos = new THREE.Vector3();
          keeper.getWorldPosition(keeperWorldPos);
          ballBody.position.set(
            keeperWorldPos.x,
            keeperWorldPos.y + 1.5,
            keeperWorldPos.z + 0.5
          );
        } else {
          const normal = new CANNON.Vec3().copy(ballBody.position).vsub(e.body.position).normalize();
          const bounceStrength = Math.min(impactForce * 0.5, 20);
          ballBody.velocity = normal.scale(bounceStrength);
        }
      }
    });
  }, undefined, (err) => console.error("Ball loading error:", err));
}

function loadPlayer() {
  loader.load("/models/player.glb", (gltf) => {
    player = gltf.scene;
    player.scale.set(5, 5, 5);
    player.position.set(0, 0, 0);
    player.castShadow = true;
    player.receiveShadow = true;
    scene.add(player);

    mixer = new THREE.AnimationMixer(player);
    gltf.animations.forEach((clip) => {
      const name = clip.name.toLowerCase();
      if (name.includes("fastrun")) {
        actions.fastrun = mixer.clipAction(clip);
        actions.fastrun.loop = THREE.LoopRepeat;
      } else if (name.includes("idle")) {
        actions.idle = mixer.clipAction(clip);
        actions.idle.loop = THREE.LoopRepeat;
      } else if (name.includes("pass")) {
        clip = THREE.AnimationUtils.subclip(clip, "pass", 70, 110);
        actions.pass = mixer.clipAction(clip);
        actions.pass.loop = THREE.LoopOnce;
        actions.pass.clampWhenFinished = true;
      } else if (name.includes("kick")) {
        clip = THREE.AnimationUtils.subclip(clip, "kick", 110, 170);
        actions.kick = mixer.clipAction(clip);
        actions.kick.loop = THREE.LoopOnce;
        actions.kick.clampWhenFinished = true;
      } else if (name.includes("tackle")) {
        clip = clip.clone();
        clip.tracks = clip.tracks.filter(track => !track.name.endsWith(".position"));
        actions.tackle = mixer.clipAction(clip);
        actions.tackle.loop = THREE.LoopOnce;
        actions.tackle.clampWhenFinished = true;
      }
    });

    if (actions.idle) actions.idle.reset().play();

    player.updateMatrixWorld(true);

    const playerBox = new THREE.Box3().setFromObject(player);
    const playerWorldPos = new THREE.Vector3();
    player.getWorldPosition(playerWorldPos);
    playerOriginToBottom = playerWorldPos.y - playerBox.min.y;

    const baseRadius = 0.5;
    const baseHeight = 1.8;
    const meshScale = player.scale.y;
    const radiusWorld = baseRadius * meshScale;
    const heightWorld = baseHeight * meshScale;

    function createCapsuleWorld(radius, height) {
      const body = new CANNON.Body({ mass: 70 });
      const sphere = new CANNON.Sphere(radius);
      const cyl = new CANNON.Cylinder(radius, radius, height, 8);
      body.addShape(sphere, new CANNON.Vec3(0, -height / 2, 0));
      body.addShape(sphere, new CANNON.Vec3(0, height / 2, 0));
      body.addShape(cyl);
      return body;
    }

    playerBody = createCapsuleWorld(radiusWorld, heightWorld);
    playerColliderHalfTotal = heightWorld / 2 + radiusWorld;
    playerBody.position.set(0, groundTopY + playerColliderHalfTotal, 0);
    playerBody.fixedRotation = true;
    playerBody.updateMassProperties();
    world.addBody(playerBody);

    const playerMat = new CANNON.Material("player");
    playerBody.material = playerMat;
    if (groundBody) {
      const contactPG = new CANNON.ContactMaterial(playerMat, groundBody.material || new CANNON.Material("ground"), {
        friction: 0.6,
        restitution: 0.0,
      });
      world.addContactMaterial(contactPG);
    }
  }, undefined, (err) => console.error("Player loading error:", err));
}

function fadeToAction(name, duration = 0.2) {
  if (!actions[name]) {
    console.log("no action for", name);
    return;
  }

  const nextAction = actions[name];
  if (currentAction === nextAction) return;

  if (currentAction) {
    currentAction.fadeOut(duration);
  }

  nextAction.reset();
  nextAction.paused = false;
  nextAction.enabled = true;
  nextAction.time = 0;
  nextAction.fadeIn(duration).play();
  currentAction = nextAction;
  currentState = name;
}

function handleKick() {
  if (!player || !ballBody) return;
  isKicking = true;
  fadeToAction("kick", 0.1);

  const forward = new CANNON.Vec3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  const power = 150, lift = 15;
  const distance = playerBody.position.vsub(ballBody.position).length();

  if (distance < 7.35) {
    setTimeout(() => {
      playerHasBall = false;
      ballBody.velocity.set(forward.x * power, lift, forward.z * power);
      isKicking = false;
    }, 330);
  }
}

function handlePass() {
  if (!player || !ballBody) return;
  isPassing = true;
  fadeToAction("pass", 0.1);

  const forward = new CANNON.Vec3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  const power = 30;
  const distance = playerBody.position.vsub(ballBody.position).length();

  if (distance < 7.35) {
    setTimeout(() => {
      playerHasBall = false;
      ballBody.velocity.set(forward.x * power, 0, forward.z * power);
      isPassing = false;
    }, 400);
  }
}

function handleTackle() {
  if (!playerBody || !player) return;

  fadeToAction("tackle", 0.1);

  const forward = new CANNON.Vec3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  const tacklePower = 60;
  playerBody.velocity.x = forward.x * tacklePower;
  playerBody.velocity.z = forward.z * tacklePower;
}

function addGoalZone(name, x, z, width = 20, height = 10, depth = 5, color = 0xffff00) {
  const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
  const body = new CANNON.Body({ mass: 0, collisionResponse: false });
  body.addShape(shape);
  body.position.set(x, groundTopY + height / 2, z);
  body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), (2 * Math.PI) / 2);
  body.name = name;
  world.addBody(body);
  goalZones.push(body);

  const mat = new THREE.MeshBasicMaterial({
    color: color,
    opacity: 0.3,
    transparent: true,
    visible: false
  });
  const geom = new THREE.BoxGeometry(width, height, depth);
  const debug = new THREE.Mesh(geom, mat);
  debug.position.copy(body.position);
  scene.add(debug);
}

function addGoalBlocker(goalBody, offsetZ = 3, width = 4, height = 3, depth = 1, color = 0xff0000) {
  const y = groundTopY + height / 2;
  const startX = goalBody.position.x;
  const z = goalBody.position.z + offsetZ;

  const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  body.position.set(startX, y, z);
  world.addBody(body);

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(body.position);
  scene.add(mesh);

  blockers.push({ 
    body, 
    mesh, 
    baseX: startX, 
    amplitude: 10 + Math.random() * 5, 
    speed: 1 + Math.random() 
  });
}

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

      const netMesh = goal.name === "goal1"
        ? stadium.getObjectByName("net1")
        : stadium.getObjectByName("net2");
      if (netMesh) {
        netAnims.push({ mesh: netMesh, time: 0 });
      }

      ballBody.position.set(0, groundTopY + ballRadiusWorld + 1, 0);
      ballBody.velocity.set(0, 0, 0);
      ballBody.angularVelocity.set(0, 0, 0);
    }
  }
  
  if (score > 0) {
    if (currentLevel < 3) {
      currentLevel++;
      score = 0;
      loadLevel(currentLevel);
    } else {
      alert("🏆 You completed all levels!");
    }
  }
}

const keys = {
  w: false,
  s: false,
  a: false,
  d: false,
  p: false,
  k: false,
  c: false
};

window.addEventListener("keydown", (e) => {
  if (e.key in keys) keys[e.key] = true;
  if (e.key === "c") {
    cameraMode = (cameraMode + 1) % 3;
    switch (cameraMode) {
      case 0:
        updateFIFACamera();
        break;
      case 1:
        camera.position.set(100, 30, 0);
        camera.lookAt(0, 0, 0);
        break;
      case 2:
        camera.position.set(0, 150, 0);
        camera.lookAt(0, 0, 0);
        break;
    }
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
  if (e.key === "t") {
    handleTackle();
  }
});

let gameStarted = false;
let gameOver = false;
let gameTime = 120;
let timerInterval;

const timerDiv = document.getElementById("timerDiv");
const startScreen = document.getElementById("startScreen");
const gameOverDiv = document.getElementById("gameOverDiv");
const startBtn = document.getElementById("startBtn");

if (startBtn) {
  startBtn.addEventListener("click", startGame);
}

function startGame() {
  if (startScreen) startScreen.style.display = "none";
  if (timerDiv) timerDiv.style.display = "block";
  gameStarted = true;
  gameOver = false;
  gameTime = 300;
  score = 0;
  scoreDiv.innerText = "Score: 0";

  if (ballBody) {
    ballBody.position.set(0, groundTopY + ballRadiusWorld + 1, 0);
    ballBody.velocity.set(0, 0, 0);
  }

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!gameStarted) return;
    gameTime--;
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    if (timerDiv) {
      timerDiv.innerText = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    if (gameTime <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  gameStarted = false;
  gameOver = true;
  clearInterval(timerInterval);
  if (timerDiv) timerDiv.style.display = "none";
  if (gameOverDiv) gameOverDiv.style.display = "flex";
}

function restartGame() {
  if (gameOverDiv) gameOverDiv.style.display = "none";
  if (startScreen) startScreen.style.display = "flex";
}

const playerSpeed = 15;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;

function updateFIFACamera() {
  if (!player || !playerBody) return;

  const playerPos = player.position.clone();
  const playerDirection = new THREE.Vector3(
    Math.sin(player.rotation.y),
    0,
    Math.cos(player.rotation.y)
  );

  const desiredPosition = playerPos.clone()
    .add(cameraOffset.clone().applyEuler(new THREE.Euler(0, player.rotation.y, 0)));

  camera.position.lerp(desiredPosition, cameraLerpFactor);

  const lookAtTarget = playerPos.clone().add(playerDirection.multiplyScalar(10));
  lookAtTarget.y += 5;

  camera.lookAt(lookAtTarget);
}

function animate() {
  requestAnimationFrame(animate);
  
  if (!gameStarted || gameOver) {
    renderer.render(scene, camera);
    return;
  }

  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  // Update crowd animations
  if (crowdUniforms1) crowdUniforms1.time.value = elapsedTime;
  if (crowdUniforms2) crowdUniforms2.time.value = elapsedTime;

  world.step(timeStep, delta);
  checkGoals();

  if (playerBody && ballBody) {
    keepBallClose();
  }

  if (cameraMode === 0) {
    updateFIFACamera();
  }

  if (playerBody) {
    let moveX = 0;
    let moveZ = 0;
    if (keys.w) moveZ -= 1;
    if (keys.s) moveZ += 1;
    if (keys.a) moveX -= 1;
    if (keys.d) moveX += 1;

    const length = Math.hypot(moveX, moveZ);
    let nx = 0, nz = 0;
    if (length > 0) { 
      nx = moveX / length; 
      nz = moveZ / length; 
    }

    desiredPlayerVel.x = nx * playerSpeed;
    desiredPlayerVel.z = nz * playerSpeed;

    const lerp = 1 - Math.pow(1 - playerVelLerp, Math.max(1, delta * 60));
    playerBody.velocity.x += (desiredPlayerVel.x - playerBody.velocity.x) * lerp;
    playerBody.velocity.z += (desiredPlayerVel.z - playerBody.velocity.z) * lerp;

    if (length > 0.1 && player) {
      const targetAngle = Math.atan2(nx, nz);
      const short = ((targetAngle - player.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
      player.rotation.y += short * 0.25;
    }
  }

  if (player && playerBody) {
    player.position.copy(playerBody.position);
    const capsuleBottomY = playerBody.position.y - playerColliderHalfTotal;
    player.position.y = capsuleBottomY + playerOriginToBottom;
  }

  if (ball && ballBody) {
    ball.position.copy(ballBody.position);
    ball.quaternion.copy(ballBody.quaternion);
  }

  const isMoving = keys.w || keys.s || keys.d || keys.a;

  if (mixer) {
    if (actions.idle && actions.fastrun) {
      if (currentState !== "kick" && currentState !== "pass" && currentState !== "tackle") {
        if (isMoving) {
          fadeToAction("fastrun", 0.25);
        } else {
          fadeToAction("idle", 0.25);
        }
      }
    }

    mixer.update(delta);

    if (currentAction && (currentState === "kick" || currentState === "pass" || currentState === "tackle")) {
      if (currentAction.time >= currentAction.getClip().duration - 0.1) {
        isKicking = false;
        isPassing = false;
        playerHasBall = false;
        fadeToAction(isMoving ? "fastrun" : "idle", 0.3);
      }
    }
  }

  if (keeperBody && keeperBody.userData.debugMesh) {
    keeperBody.userData.debugMesh.position.copy(keeperBody.position);
    keeperBody.userData.debugMesh.quaternion.copy(keeperBody.quaternion);
  }

  if (keeperMixer) keeperMixer.update(delta);

  if (ballBody) {
    updateKeeperAI(ballBody, delta);
  }

  const elapsed = performance.now() * 0.001;
  blockers.forEach((b, i) => {
    const xOffset = Math.sin(elapsed * b.speed + i) * b.amplitude;
    const newX = b.baseX + xOffset;

    b.body.position.x = newX;
    b.mesh.position.copy(b.body.position);
    b.body.velocity.set(0, 0, 0);
  });

  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});