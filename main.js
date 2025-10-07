
let scene, camera, renderer, pitch, player, goalNet;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let balls = [];
let agents = []; // Array to store agents
let isFirstPerson = false;
let thirdPersonCamera, firstPersonCamera;
let score = 0;
let isPaused = false;
let pauseButton;
let timeLeft = 60;
let gameOver = false;
let currentStage = 1;
let totalStages = 3;
let stageConfig = {
    1: {
        name: "Beginner",
        agentCount: 2,
        agentSpeed: 0.05,
        timeLimit: 60,
        ballsToSpawn: 3,
        description: "Learn the basics"
    },
    2: {
        name: "Intermediate", 
        agentCount: 3,
        agentSpeed: 0.08,
        timeLimit: 45,
        ballsToSpawn: 4,
        description: "More opponents, less time"
    },
    3: {
        name: "Expert",
        agentCount: 4,
        agentSpeed: 0.12,
        timeLimit: 30,
        ballsToSpawn: 5,
        description: "Maximum challenge!"
    }
};
const playlist = [
    'music/Bo-Thata.mp3',
    'music/Donga.mp3',
    'music/Ikude-Iqondo.mp3',
    'music/Mthuthulezi.mp3',
    'music/Ndimfumene.mp3',
    'music/Piki-Piki.mp3',
    'music/Xola-Intliziyo.mp3'
];
let currentTrackIndex = 0;
const backgroundMusic = new Audio();
backgroundMusic.loop = false;

function playCurrentTrack(){
    backgroundMusic.src = playlist[currentTrackIndex];
    backgroundMusic.play().catch(error => console.error('Error playing track:', error));
}

function playNextTrack(){
    let newIndex;
    do{
        newIndex = Math.floor(Math.random() * playlist.length);
    }while(newIndex === currentTrackIndex);
    currentTrackIndex = newIndex;
    playCurrentTrack();
}

backgroundMusic.addEventListener('ended', playNextTrack);

function playMusic(){
    if(backgroundMusic.paused){
        playCurrentTrack();
    }
}

function pauseMusic(){
    backgroundMusic.pause();
}

function togglePause() {
    isPaused = !isPaused;
    
    if (isPaused) {
        // Show pause screen
        document.getElementById('pause-screen').style.display = 'flex';
        document.getElementById('pauseButton').textContent = 'Resume';
        
        // Pause background music
        if (!backgroundMusic.paused) {
            backgroundMusic.pause();
        }
    } else {
        // Hide pause screen
        document.getElementById('pause-screen').style.display = 'none';
        document.getElementById('pauseButton').textContent = 'Pause';
        
        // Resume background music if it was playing
        const musicToggle = document.getElementById('music-toggle');
        if (musicToggle && musicToggle.checked) {
            backgroundMusic.play().catch(error => console.error('Error resuming music:', error));
        }
        
        // Restart animation loop
        animate();
    }
}

function quitToMenu() {
    isPaused = false;
    gameOver = true;
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('startPage').style.display = 'flex';
    document.getElementById('pauseButton').style.display = 'none';
    pauseMusic();
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);

    thirdPersonCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    firstPersonCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera = thirdPersonCamera;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);

    createPitch();
    createPlayer();
    createGoalNet();
    createAgents();
    spawnBalls(3);
    createStadium();

    thirdPersonCamera.position.set(0, 20, 30);
    thirdPersonCamera.lookAt(0, 0, 0);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    document.getElementById('cameraButton').addEventListener('click', toggleCamera);
    document.getElementById('kickButton').addEventListener('click', kickBall);

    setInterval(updateTimer, 1000);
    document.getElementById('ui').style.display = 'block';
    
    animate();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}
document.getElementById('settingsButton').addEventListener('click', () => {
    document.getElementById('settings-modal').style.display = 'flex';
});
function closeSettings(){
    document.getElementById('settings-modal').style.display = 'none';
}

document.getElementById('music-toggle').addEventListener('change', () => {
    const musicOn = event.target.checked;
    if(musicOn){
        // play music
        playMusic();
        console.log('Music on');
    } else {
        // pause music
        pauseMusic();
        console.log('Music off');
    }
});

document.getElementById('sound-toggle').addEventListener('change', () => {
    const soundOn = event.target.checked;
    if(soundOn){
        // play sound
        console.log('Sound on');
    } else {
        // pause sound
        console.log('Sound off');
    }
});

function startGame() {
    document.getElementById('startPage').style.display = 'none';
    document.getElementById('victory-screen').style.display = 'none';
    document.getElementById('stage-transition').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    
    gameOver = false;
    currentStage = 1;
    
    // Initialize Three.js scene if not already done
    if (!scene) {
        init();
    } else {
        loadStage(currentStage);
        resetGameObjects();
    }
    
    playMusic();
}

function loadStage(stageNumber) {
    const stage = stageConfig[stageNumber];
    if (!stage) {
        console.error('Stage not found:', stageNumber);
        return;
    }
    
    // Update game parameters based on stage
    timeLeft = stage.timeLimit;
    score = 0;
    
    // Update UI to show current stage
    document.getElementById('stage-display').textContent = `Stage: ${stage.name}`;
    document.getElementById('stage-description').textContent = stage.description;
    document.getElementById('timer').textContent = `Time: ${timeLeft}`;
    document.getElementById('score').textContent = `Score: ${score}`;
    updateStageTarget();
    
    console.log(`Loading stage ${stageNumber}: ${stage.name}`);
}

function updateStageTarget() {
    const target = getStageTarget(currentStage);
    document.getElementById('stage-target').textContent = `Target: ${target} goals`;
}

function gameOver1(score){
    document.getElementById('game-over-screen').style.display = 'flex';
    document.getElementById('score-display').textContent = `Final Score: ${score}`;
}

function resetGame() {
    document.getElementById('victory-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('stage-transition').style.display = 'none';
    
    gameOver = false;
    currentStage = 1;
    loadStage(currentStage);
    resetGameObjects();
    
    // Make sure animation restarts
    animate();
}
function tryAgain() {
    resetGame();
}

function createPitch() {
    const groundTexture = new THREE.TextureLoader().load('./images/grass.jpg');
    const bumpTexture = new THREE.TextureLoader().load('./images/bump.jpg');

    //Repeat and Wrapping
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(5, 5);
    bumpTexture.wrapS = THREE.RepeatWrapping;
    bumpTexture.wrapT = THREE.RepeatWrapping;
    bumpTexture.repeat.set(5, 5);

    // Create the ground geometry
    const pitchGeometry = new THREE.PlaneGeometry(60, 40, 32, 32);

    // Modify UV mapping to repeat the texture
    const uvAttribute = pitchGeometry.attributes.uv;
    for (let i = 0; i < uvAttribute.count; i++) {
        const u = uvAttribute.getX(i) * 10; // Scale U coordinate
        const v = uvAttribute.getY(i) * 10; // Scale V coordinate
        uvAttribute.setXY(i, u, v); // Update UVs
    }

    // Create ground material and mesh
    const pitchMaterial = new THREE.MeshStandardMaterial({
        map: groundTexture,
        bumpMap: bumpTexture,
        bumpScale: 0.1
    });
    const pitch = new THREE.Mesh(pitchGeometry, pitchMaterial);
    pitch.rotation.x = -Math.PI / 2; // Rotate to make it horizontal
    scene.add(pitch);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    const centerLineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-30, 0.01, 0),
        new THREE.Vector3(30, 0.01, 0)
    ]);
    const centerLine = new THREE.Line(centerLineGeometry, lineMaterial);
    scene.add(centerLine);

    const centerCircleGeometry = new THREE.CircleGeometry(5, 32);
    const centerCircleEdges = new THREE.EdgesGeometry(centerCircleGeometry);
    const centerCircle = new THREE.LineSegments(centerCircleEdges, lineMaterial);
    centerCircle.rotation.x = -Math.PI / 2;
    centerCircle.position.y = 0.01;
    scene.add(centerCircle);
}

function createPlayer() {
    const playerGeometry = new THREE.BoxGeometry(2, 3, 2);
    const playerMaterial = new THREE.MeshPhongMaterial({ color: 0x0000FF });
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    player.position.set(0, 2, 0);
    scene.add(player);
}

function createGoalNet() {
    const goalGeometry = new THREE.BoxGeometry(10, 5, 1);
    const goalMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff, wireframe: true });
    goalNet = new THREE.Mesh(goalGeometry, goalMaterial);
    goalNet.position.set(0, 2.5, -19.5);
    scene.add(goalNet);
}

function addStadiumLights(){
    const lightPostGeometry = new THREE.CylinderGeometry(0.2, 0.2, 10);
    const lightPostMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });

    for (let i = -30; i <= 30; i += 60) {
        for (let j = -20; j <= 20; j += 40) {
            const lightPost = new THREE.Mesh(lightPostGeometry, lightPostMaterial);
            lightPost.position.set(i, 5, j);
            scene.add(lightPost);

            const spotlight = new THREE.SpotLight(0xffffff, 1, 100, Math.PI / 4);
            spotlight.position.set(i, 10, j);
            spotlight.target.position.set(0, 0, 0); // Point towards the field
            scene.add(spotlight);
            scene.add(spotlight.target);
        }
    }
}

function createAgents() {
    // Clear existing agents
    agents.forEach(agent => scene.remove(agent));
    agents = [];
    
    const stage = stageConfig[currentStage];
    const agentGeometry = new THREE.BoxGeometry(2, 3, 2);
    const agentRadius = 1.5;
    
    // Create agents based on current stage
    const basePositions = [
        { x: 15, z: 0 },
        { x: -5, z: 14 },
        { x: 2, z: -14 },
        { x: 0, z: -17 }
    ];
    
    for (let i = 0; i < stage.agentCount; i++) {
        const agentMaterial = new THREE.MeshPhongMaterial({ 
            color: getAgentColor(currentStage, i) 
        });
        const agent = new THREE.Mesh(agentGeometry, agentMaterial);
        
        const pos = basePositions[i % basePositions.length];
        agent.position.set(pos.x, 2, pos.z);
        
        // Vary strategies based on stage
        if (currentStage === 1) {
            agent.strategy = i % 2 === 0 ? 'chase' : 'defend';
        } else if (currentStage === 2) {
            agent.strategy = ['chase', 'defend', 'intercept'][i % 3];
        } else {
            agent.strategy = ['chase', 'defend', 'intercept', 'block'][i % 4];
        }
        
        agent.speed = stage.agentSpeed + (Math.random() * 0.02);
        agent.radius = agentRadius;
        scene.add(agent);
        agents.push(agent);
    }
}

function getAgentColor(stage, index) {
    // Different colors for different stages
    const colors = {
        1: [0xff4444, 0xff6666], // Reds
        2: [0xffaa00, 0xffbb44, 0xffcc66], // Oranges
        3: [0x4444ff, 0x6666ff, 0x8888ff, 0xaaaaff] // Blues
    };
    return colors[stage][index % colors[stage].length];
}

function updateAgents() {
    agents.forEach(agent => {
        const stage = stageConfig[currentStage];
        
        switch (agent.strategy) {
            case 'chase':
                chasePlayer(agent);
                break;
            case 'defend':
                defendGoal(agent);
                break;
            case 'intercept':
                interceptPlayer(agent);
                break;
            case 'block':
                blockShots(agent);
                break;
        }
        
        // More aggressive in higher stages
        if (currentStage > 1) {
            tryStealBall(agent);
        }
    });
}

function interceptPlayer(agent) {
    // Predict player movement and intercept
    const predictDistance = 3;
    const targetX = player.position.x + (player.position.x - agent.position.x) * predictDistance;
    const targetZ = player.position.z + (player.position.z - agent.position.z) * predictDistance;
    
    const dx = targetX - agent.position.x;
    const dz = targetZ - agent.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance > 1) {
        agent.position.x += (dx / distance) * agent.speed;
        agent.position.z += (dz / distance) * agent.speed;
    }
}

function blockShots(agent) {
    // Position between player and goal
    const blockX = (player.position.x + goalNet.position.x) / 2;
    const blockZ = (player.position.z + goalNet.position.z) / 2;
    
    const dx = blockX - agent.position.x;
    const dz = blockZ - agent.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance > 1) {
        agent.position.x += (dx / distance) * agent.speed * 0.7;
        agent.position.z += (dz / distance) * agent.speed * 0.7;
    }
}

function tryStealBall(agent) {
    balls.forEach(ball => {
        const dx = ball.position.x - agent.position.x;
        const dz = ball.position.z - agent.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 2) {
            // Kick ball away from player
            ball.velocity.x = (ball.position.x - player.position.x) * 0.1;
            ball.velocity.z = (ball.position.z - player.position.z) * 0.1;
        }
    });
}

function updateAgents() {
    agents.forEach(agent => {
        if (agent.strategy === 'chase') {
            // Agents will chase the player
            const dx = player.position.x - agent.position.x;
            const dz = player.position.z - agent.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance > 1) {
                const moveX = (dx / distance) * agent.speed;
                const moveZ = (dz / distance) * agent.speed;
                agent.position.x += moveX;
                agent.position.z += moveZ;
            }
        } else if (agent.strategy === 'defend') {
            // Agent near the goal defends the zone
            if (Math.abs(agent.position.z - player.position.z) < 10) {
                agent.position.x += (player.position.x > agent.position.x) ? 0.05 : -0.05;
            }
        }
    });
}


function spawnBalls(count) {
    const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    for (let i = balls.length; i < count; i++) {
        const ballMaterial = new THREE.MeshPhongMaterial({ color: getRandomColor() });
        const ball = new THREE.Mesh(ballGeometry, ballMaterial);
        ball.position.set(Math.random() * 50 - 25, 0.5, Math.random() * 30 - 15);
        ball.velocity = new THREE.Vector3(0, 0, 0);
        scene.add(ball);
        balls.push(ball);
    }
}

function getRandomColor() {
    return Math.random() * 0xffffff;
}

function onKeyDown(event) {
    if (isPaused && event.code !== 'Escape') {
        return; 
    }
    
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': kickBall(); break;
        case 'Escape': togglePause(); break; // Add ESC key for pause
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function updatePlayer() {
    const moveSpeed = 0.1;
    let movement = new THREE.Vector3();

    if (moveForward) movement.z -= 1;
    if (moveBackward) movement.z += 1;
    if (moveLeft) movement.x -= 1;
    if (moveRight) movement.x += 1;

    if (movement.length() > 0) {
        movement.normalize();
        player.position.x += movement.x * moveSpeed;
        player.position.z += movement.z * moveSpeed;
    }

    player.position.x = Math.max(-29, Math.min(29, player.position.x));
    player.position.z = Math.max(-19, Math.min(19, player.position.z));

    // Move camera with player in first-person mode
    if (isFirstPerson) {
        firstPersonCamera.position.set(player.position.x, player.position.y + 3, player.position.z);
        firstPersonCamera.lookAt(player.position.x, player.position.y + 2, player.position.z + 1);
    }
}

function updateTimer() {
    if (timeLeft > 0 && !gameOver) {
        timeLeft--;
        document.getElementById('timer').textContent = `Time: ${timeLeft}`;
    } else if (timeLeft === 0) {
        gameOver = true;
        gameOver1(score);
    }
}

function checkGoal() {
    if (balls.length > 0) {
        balls.forEach(ball => {
            if (Math.abs(ball.position.x) < 5 && ball.position.z < -18) {
                score++;
                document.getElementById('score').textContent = `Score: ${score}`;
                scene.remove(ball);
                balls = balls.filter(b => b !== ball);
                spawnBalls(stageConfig[currentStage].ballsToSpawn);
                
                checkStageCompletion();
            }
        });
    }
}

function kickBall() {
    const kickStrength = 0.3;
    balls.forEach(ball => {
        const dx = ball.position.x - player.position.x;
        const dz = ball.position.z - player.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < 3) {
            ball.velocity.x = (dx / distance) * kickStrength;
            ball.velocity.z = (dz / distance) * kickStrength;
        }
    });
}

function checkStageCompletion() {
    const stage = stageConfig[currentStage];
    const stageComplete = score >= getStageTarget(currentStage);
    
    if (stageComplete) {
        if (currentStage < totalStages) {
            advanceToNextStage();
        } else {
            gameWon();
        }
    }
}

function getStageTarget(stageNumber) {
    // Define score targets for each stage
    const stageTargets = {
        1: 3,  // Need 3 goals to complete stage 1
        2: 6,  // Need 6 goals to complete stage 2  
        3: 10  // Need 10 goals to complete stage 3
    };
    return stageTargets[stageNumber];
}

function pauseGame() {
    gameOver = true;
}

function resumeGame() {
    gameOver = false;
    animate();
}

function advanceToNextStage() {
    currentStage++;
    pauseGame();
    
    // Show stage transition screen
    document.getElementById('stage-transition').style.display = 'flex';
    document.getElementById('next-stage-name').textContent = stageConfig[currentStage].name;
    document.getElementById('next-stage-desc').textContent = stageConfig[currentStage].description;
    
    // Update agent count and behavior for new stage
    setTimeout(() => {
        document.getElementById('stage-transition').style.display = 'none';
        loadStage(currentStage);
        resetGameObjects();
        resumeGame();
    }, 3000); 
}


function resetGameObjects() {
    // Clear existing balls
    balls.forEach(ball => scene.remove(ball));
    balls = [];
    
    // Clear existing agents
    agents.forEach(agent => scene.remove(agent));
    agents = [];
    
    // Reset player position
    player.position.set(0, 2, 0);
    
    // Create new agents and balls for the current stage
    createAgents();
    spawnBalls(stageConfig[currentStage].ballsToSpawn);
    
    // Update camera position
    if (isFirstPerson) {
        firstPersonCamera.position.set(player.position.x, player.position.y + 3, player.position.z);
        firstPersonCamera.lookAt(player.position.x, player.position.y + 2, player.position.z + 1);
    } else {
        thirdPersonCamera.position.set(0, 20, 30);
        thirdPersonCamera.lookAt(0, 0, 0);
    }
}
function gameWon() {
    gameOver = true;
    document.getElementById('victory-screen').style.display = 'flex';
    document.getElementById('final-score').textContent = `Final Score: ${score}`;
}


function updateBalls() {
    const pitchBoundaryX = 29;
    const pitchBoundaryZ = 19;
    const ballRadius = 0.5;

    balls.forEach(ball => {
        ball.position.add(ball.velocity);
        ball.velocity.multiplyScalar(0.99); // Apply friction

    // Check X boundary
    if (ball.position.x >= pitchBoundaryX - ballRadius) {
        ball.position.x = pitchBoundaryX - ballRadius; // Clamp position
        ball.velocity.x = -Math.abs(ball.velocity.x) * 0.8; // Bounce back and reduce speed
    } else if (ball.position.x <= -pitchBoundaryX + ballRadius) {
        ball.position.x = -pitchBoundaryX + ballRadius;
        ball.velocity.x = Math.abs(ball.velocity.x) * 0.8;
    }

    // Check Z boundary
    if (ball.position.z >= pitchBoundaryZ - ballRadius) {
        ball.position.z = pitchBoundaryZ - ballRadius;
        ball.velocity.z = -Math.abs(ball.velocity.z) * 0.8;
    } else if (ball.position.z <= -pitchBoundaryZ + ballRadius) {
        ball.position.z = -pitchBoundaryZ + ballRadius;
        ball.velocity.z = Math.abs(ball.velocity.z) * 0.8;
    }
    });
}

function updateAgentCollisions() {
    const agentRadius = 1.5;

    agents.forEach((agent1, i) => {
        agents.forEach((agent2, j) => {
            if (i !== j) {
                const dx = agent1.position.x - agent2.position.x;
                const dz = agent1.position.z - agent2.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance < agentRadius * 2) {
                    // Calculate overlap and apply repelling force
                    const overlap = agentRadius * 2 - distance;
                    const nx = dx / distance;
                    const nz = dz / distance;

                    agent1.position.x += nx * overlap * 0.5;
                    agent1.position.z += nz * overlap * 0.5;

                    agent2.position.x -= nx * overlap * 0.5;
                    agent2.position.z -= nz * overlap * 0.5;
                }
            }
        });
    });
}


function updatePlayerBallCollisions() {
    const playerRadius = 1.5;
    const pushStrength = 0.05; // The strength with which the player pushes the ball

    balls.forEach(ball => {
        const dx = ball.position.x - player.position.x;
        const dz = ball.position.z - player.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < playerRadius + ball.geometry.parameters.radius) {
            // Calculate the push direction
            const pushX = (dx / distance) * pushStrength;
            const pushZ = (dz / distance) * pushStrength;

            // Apply the push to the ball
            ball.velocity.x += pushX;
            ball.velocity.z += pushZ;

            // Adjust ball position to prevent overlap
            ball.position.x += pushX;
            ball.position.z += pushZ;
        }
    });
}
function checkAgentPlayerCollisions() {
    const playerRadius = 1.5; // Assume player radius is similar to agent's radius
    agents.forEach(agent => {
        const dx = player.position.x - agent.position.x;
        const dz = player.position.z - agent.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < playerRadius + agent.radius) { // Collision detected
            const overlap = playerRadius + agent.radius - distance;
            const nx = dx / distance;
            const nz = dz / distance;

            // Push player and agent apart
            player.position.x += nx * overlap * 0.5;
            player.position.z += nz * overlap * 0.5;
            agent.position.x -= nx * overlap * 0.5;
            agent.position.z -= nz * overlap * 0.5;
        }
    });
}


let animationRunning = false;


function animate() {
    if (gameOver || animationRunning || isPaused) return;
    animationRunning = true;

    requestAnimationFrame(() => {
        animationRunning = false;
        animate();
    });
    
    // Only update game logic if not paused
    if (!isPaused) {
        updatePlayer();
        updateAgents();
        updateBalls();
        updatePlayerBallCollisions();
        updateAgentCollisions();
        checkAgentPlayerCollisions();
        checkGoal();
    }
    
    renderer.render(scene, camera);
}

function toggleCamera() {
    isFirstPerson = !isFirstPerson;
    camera = isFirstPerson ? firstPersonCamera : thirdPersonCamera;
}

function createStadium() {
    const stadiumGeometry = new THREE.BoxGeometry(70, 10, 50);
    const stadiumMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00, wireframe: true });
    const stadium = new THREE.Mesh(stadiumGeometry, stadiumMaterial);
    stadium.position.set(0, -5, 0);
    scene.add(stadium);

    const floodlight1 = new THREE.DirectionalLight(0xffffff, 0.1);
    floodlight1.position.set(-30, 20, 10);
    floodlight1.castShadow = true;
    scene.add(floodlight1);

    const floodlight2 = new THREE.DirectionalLight(0xffffff, 0.1);
    floodlight2.position.set(30, 20, 10);
    floodlight2.castShadow = true;
    scene.add(floodlight2);

    const floodlight3 = new THREE.DirectionalLight(0xffffff, 0.1);
    floodlight3.position.set(-30, 20, -20);
    floodlight3.castShadow = true;
    scene.add(floodlight3);

    const floodlight4 = new THREE.DirectionalLight(0xffffff, 0.1);
    floodlight4.position.set(30, 20, -20);
    floodlight4.castShadow = true;
    scene.add(floodlight4);

    const bannerTexture = new THREE.TextureLoader().load('./images/ad_banner4.jpeg', (texture) =>{
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = 30;
        texture.minFilter = THREE.LinearFilter;

    }); // You can replace this with any banner image
    const bannerMaterial = new THREE.MeshBasicMaterial({ map: bannerTexture });
    const bannerGeometry = new THREE.PlaneGeometry(12, 4);
    
    const banner1 = new THREE.Mesh(bannerGeometry, bannerMaterial);
    banner1.position.set(0, 5, 25); // Behind one goal
    banner1.rotation.y = Math.PI; // Make it face inward
    scene.add(banner1);

    const banner2 = new THREE.Mesh(bannerGeometry, bannerMaterial);
    banner2.position.set(0, 5, -25); // Behind the other goal
    scene.add(banner2);

    const banner3 = new THREE.Mesh(bannerGeometry, bannerMaterial);
    banner3.position.set(35, 5, 0); // On one side of the stadium
    banner3.rotation.y = Math.PI / 2; // Make it face inward
    scene.add(banner3);

    const banner4 = new THREE.Mesh(bannerGeometry, bannerMaterial);
    banner4.position.set(-35, 5, 0); // On the other side of the stadium
    banner4.rotation.y = -Math.PI / 2; // Make it face inward
    scene.add(banner4);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.1); // Soft ambient light
    scene.add(ambientLight);
}
document.getElementById('playButton').addEventListener('click', startGame);

document.getElementById('controlsButton').addEventListener('click', () => {alert("Use WASD to move, spacebar to jump")});

window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

//init();
