import './style.css'
import * as THREE from 'three';
import { io } from 'socket.io-client';

// --- Constants ---
const SERVER_URL = import.meta.env.VITE_API_URL || (window.location.port === '5173' 
    ? 'http://localhost:3000' 
    : window.location.origin);
const CAMERA_HEIGHT = 40;

// --- Global Variables ---
let socket;
let scene, camera, renderer;
let clock;
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
let groundPlane;

// Game State
let myId = null;
// playerMeshes structure: 
// { 
//   id: { 
//     segments: [Mesh, ...], 
//     path: [{pos: Vector3, rot: Quaternion}], 
//     targetHeadPos: Vector3, 
//     targetAngle: number,
//     currentAngle: number,
//     color: number
//   } 
// }
let playerMeshes = {}; 
let foodMeshes = {};
let arenaSize = 200;

// UI
const uiScore = document.querySelector('#score-board span');
const uiFinalScore = document.querySelector('#final-score');
const screenStart = document.getElementById('start-screen');
const screenGameOver = document.getElementById('game-over-screen');
const btnStart = document.getElementById('start-btn');
const btnRestart = document.getElementById('restart-btn');

// --- Init ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 20, 150);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, CAMERA_HEIGHT, 20);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.getElementById('game-container').appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    createFloor(200);
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);

    clock = new THREE.Clock();

    connectSocket();
    renderer.setAnimationLoop(render);
}

function createFloor(size) {
    if (scene.getObjectByName('floor')) scene.remove(scene.getObjectByName('floor'));
    if (scene.getObjectByName('grid')) scene.remove(scene.getObjectByName('grid'));

    const planeGeometry = new THREE.PlaneGeometry(size + 100, size + 100);
    const planeMaterial = new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false });
    const floor = new THREE.Mesh(planeGeometry, planeMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.name = 'floor';
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(size, 50, 0x444444, 0x333333);
    gridHelper.position.y = 0.01;
    gridHelper.name = 'grid';
    scene.add(gridHelper);
    
    arenaSize = size;
}

function connectSocket() {
    socket = io(SERVER_URL, {
        reconnectionAttempts: 5,
        transports: ['polling', 'websocket']
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        myId = socket.id;
    });

    socket.on('init', (data) => {
        myId = data.id;
        createFloor(data.arenaSize);
    });

    socket.on('gameState', (state) => {
        updateGameState(state);
    });
    
    socket.on('playerLeft', (id) => {
        removePlayer(id);
    });
}

function startGame() {
    socket.emit('joinGame', 'Player');
    screenStart.classList.add('hidden');
    screenGameOver.classList.add('hidden');
}

// --- Rendering & Logic ---

function updateGameState(state) {
    // 1. Foods
    const seenFoods = new Set();
    state.foods.forEach(f => {
        seenFoods.add(f.id);
        if (!foodMeshes[f.id]) {
            const geo = new THREE.OctahedronGeometry(0.8, 0);
            const mat = new THREE.MeshPhongMaterial({ 
                color: f.color, emissive: f.color, emissiveIntensity: 0.5 
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(f.x, 1, f.z);
            mesh.castShadow = true;
            scene.add(mesh);
            foodMeshes[f.id] = mesh;
        } 
    });
    
    for (const id in foodMeshes) {
        if (!seenFoods.has(id)) {
            scene.remove(foodMeshes[id]);
            delete foodMeshes[id];
        }
    }

    // 2. Players
    const activePlayers = new Set();
    let meAlive = false;

    state.players.forEach(p => {
        activePlayers.add(p.id);
        if (p.id === myId) {
            meAlive = true;
            uiScore.innerText = p.score;
        }
        
        if (!playerMeshes[p.id]) {
            createPlayerMesh(p);
        }
        // Update Target Data (don't move mesh yet, do that in render loop)
        const group = playerMeshes[p.id];
        group.targetHeadPos = new THREE.Vector3(p.x, 1.2, p.z);
        group.targetAngle = p.angle;
        group.score = p.score;
        group.serverScore = p.score;
        
        // If it's a new player or respawn, snap immediately
        if (group.segments.length === 0) {
            // will be handled in render loop by growing
        }
    });

    if (!meAlive && screenGameOver.classList.contains('hidden') && screenStart.classList.contains('hidden')) {
         screenGameOver.classList.remove('hidden');
         uiFinalScore.innerText = uiScore.innerText;
    }

    for (const id in playerMeshes) {
        if (!activePlayers.has(id)) {
            removePlayer(id);
        }
    }
}

function createPlayerMesh(data) {
    playerMeshes[data.id] = {
        id: data.id,
        segments: [],
        path: [],
        color: data.color,
        targetHeadPos: new THREE.Vector3(data.x, 1.2, data.z),
        targetAngle: data.angle,
        currentAngle: data.angle,
        score: data.score
    };
}

function growSnake(group) {
    const isHead = group.segments.length === 0;
    const geo = new THREE.SphereGeometry(isHead ? 1.2 : 1.0, 16, 16);
    const mat = new THREE.MeshPhongMaterial({ color: group.color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    
    if (isHead) {
         const eyeGeo = new THREE.SphereGeometry(0.3, 8, 8);
         const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
         const pupilGeo = new THREE.SphereGeometry(0.15, 8, 8);
         const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
     
         const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
         leftEye.position.set(0.6, 0.4, 0.8);
         mesh.add(leftEye);
         leftEye.add(new THREE.Mesh(pupilGeo, pupilMat).translateZ(0.25));

         const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
         rightEye.position.set(-0.6, 0.4, 0.8);
         mesh.add(rightEye);
         rightEye.add(new THREE.Mesh(pupilGeo, pupilMat).translateZ(0.25));
    }
    
    // Spawn at last segment pos or head pos
    const spawnPos = group.segments.length > 0 
        ? group.segments[group.segments.length-1].position.clone()
        : group.targetHeadPos.clone();
        
    mesh.position.copy(spawnPos);
    scene.add(mesh);
    group.segments.push(mesh);
}

function removePlayer(id) {
    if (playerMeshes[id]) {
        playerMeshes[id].segments.forEach(m => scene.remove(m));
        delete playerMeshes[id];
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function render() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.getElapsedTime();

    // Input
    if (screenStart.classList.contains('hidden') && !screenGameOver.classList.contains('hidden') === false) {
        raycaster.setFromCamera(mouse, camera);
        const intersect = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, intersect);
        
        if (intersect && myId && playerMeshes[myId] && playerMeshes[myId].segments[0]) {
            const headPos = playerMeshes[myId].segments[0].position;
            const dx = intersect.x - headPos.x;
            const dz = intersect.z - headPos.z;
            const angle = Math.atan2(dx, dz);
            
            if (socket) socket.emit('input', { angle });
        }
    }
    
    // Update Players (Interpolation & Body Simulation)
    for (const id in playerMeshes) {
        const p = playerMeshes[id];
        
        // 0. Ensure length matches score (approx length = score + 8 usually)
        // Simplified: just match score + constant
        const targetLen = p.serverScore + 8;
        while(p.segments.length < targetLen) {
            growSnake(p);
        }
        
        if (p.segments.length === 0) continue;

        // 1. Move Head (Interpolate towards server target)
        const head = p.segments[0];
        
        // Smoothly move head towards target
        // We use a stronger lerp for the head to keep it synced
        const distToTarget = head.position.distanceTo(p.targetHeadPos);
        if (distToTarget > 10) {
            // Snap if too far (teleport/respawn)
            head.position.copy(p.targetHeadPos);
        } else {
            // Lerp
            head.position.lerp(p.targetHeadPos, 10 * dt);
        }
        
        // Rotate head
        // Interpolate angle
        let angleDiff = p.targetAngle - p.currentAngle;
        while (angleDiff <= -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        p.currentAngle += angleDiff * 10 * dt;
        head.rotation.y = p.currentAngle; // Assuming y-up rotation

        // 2. Record Path
        // We push the head's CURRENT interpolated position to the path
        p.path.unshift({
            position: head.position.clone(),
            quaternion: head.quaternion.clone()
        });
        
        // Limit path memory
        if (p.path.length > p.segments.length * 15) {
            p.path.pop();
        }

        // 3. Move Body Segments (Follow path)
        const bodySpacing = 1.5;
        let currentPathIndex = 0;
        
        for (let i = 1; i < p.segments.length; i++) {
            const segment = p.segments[i];
            const prevSegment = p.segments[i-1];
            
            let targetPos = null;
            
            // Search path backwards from currentPathIndex
            for (let j = currentPathIndex; j < p.path.length; j++) {
                const pt = p.path[j];
                const dist = prevSegment.position.distanceTo(pt.position);
                
                if (dist >= bodySpacing) {
                    targetPos = pt.position;
                    currentPathIndex = j;
                    break;
                }
            }
            
            if (targetPos) {
                segment.position.lerp(targetPos, 20 * dt); // High lerp to stick to path
                segment.lookAt(prevSegment.position);
            } else {
                // Fallback if path is too short (just spawned), lerp to prev
                segment.position.lerp(prevSegment.position, 5 * dt);
            }
        }
    }
    
    // Camera Follow (Smoother)
    if (myId && playerMeshes[myId] && playerMeshes[myId].segments[0]) {
        const head = playerMeshes[myId].segments[0];
        const camOffset = new THREE.Vector3(0, CAMERA_HEIGHT, 15);
        const targetCamPos = head.position.clone().add(camOffset);
        camera.position.lerp(targetCamPos, 2.0 * dt);
        camera.lookAt(head.position);
    }
    
    // Food Animation
    for(const id in foodMeshes) {
        const m = foodMeshes[id];
        m.position.y = 1 + Math.sin(time * 3 + m.id * 10) * 0.3;
        m.rotation.y += 1.0 * dt;
    }

    renderer.render(scene, camera);
}

// UI
btnStart.addEventListener('click', startGame);
btnRestart.addEventListener('click', startGame);

init();