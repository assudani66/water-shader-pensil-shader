import * as THREE from 'three';
THREE.Cache.enabled = true;
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import GUI from 'lil-gui';

import { WatercolorShader } from './shaders/Watercolor.js';
import { PencilLinesShader } from './shaders/PencilLines.js';
import { createPaperTexture } from './utils/PaperTexture.js';

// Init Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
// scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 7);
// dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
// scene.add(dirLight);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;

// Load GLB
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/gltf/'); // Path to the decoder files in public/draco/gltf

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const progressBar = document.getElementById('progress-bar');
const percentageText = document.getElementById('percentage');
const loaderContainer = document.getElementById('loader-container');

const modelUrl = 'https://edesignte.s3.amazonaws.com/Final.glb';
const CACHE_NAME = 'glb-cache-v1';

async function loadModelWithCache() {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(modelUrl);

    if (cachedResponse) {
        console.log('Loading model from cache...');
        const blob = await cachedResponse.blob();
        const url = URL.createObjectURL(blob);
        loadGLB(url);
    } else {
        console.log('Fetching model from S3...');
        // We use a custom fetch to track progress and then cache
        fetchModelAndCache();
    }
}

async function fetchModelAndCache() {
    const response = await fetch(modelUrl);

    if (!response.ok) throw new Error('Network response was not ok');

    const reader = response.body.getReader();
    const contentLength = +response.headers.get('Content-Length');
    let receivedLength = 0;
    let chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;

        const percentComplete = (receivedLength / contentLength) * 100;
        progressBar.style.width = percentComplete + '%';
        percentageText.textContent = Math.round(percentComplete) + '%';
    }

    const blob = new Blob(chunks);

    // Put in cache for next time
    const cache = await caches.open(CACHE_NAME);
    cache.put(modelUrl, new Response(blob));

    const url = URL.createObjectURL(blob);
    loadGLB(url);
}

function loadGLB(url) {
    loader.load(url, (gltf) => {
        const model = gltf.scene;

        // Auto-center and scale
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 5 / maxDim;
        model.scale.setScalar(scale);

        model.position.sub(center.multiplyScalar(scale));
        model.position.y += (size.y * scale) / 2;

        scene.add(model);

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        loaderContainer.style.opacity = '0';
        setTimeout(() => {
            loaderContainer.style.display = 'none';
        }, 500);

        // Revoke blob URL after loading to free memory
        if (url.startsWith('blob:')) {
            // Wait a bit to ensure it's fully parsed by Three.js
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

    }, undefined, (error) => {
        console.error('An error happened loading GLB:', error);
    });
}

loadModelWithCache();

// Post Processing Setup
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Paper Texture
const paperTexture = createPaperTexture();

// Watercolor Pass
const watercolorPass = new ShaderPass(WatercolorShader);
watercolorPass.uniforms['tPaper'].value = paperTexture;
watercolorPass.uniforms['texel'].value = new THREE.Vector2(1.0 / window.innerWidth, 1.0 / window.innerHeight);
composer.addPass(watercolorPass);

// Pencil Pass
const pencilPass = new ShaderPass(PencilLinesShader);
pencilPass.uniforms['tPaper'].value = paperTexture;
pencilPass.uniforms['resolution'].value = new THREE.Vector2(1.0 / window.innerWidth, 1.0 / window.innerHeight);
pencilPass.enabled = false; // Off by default as user requested "check box which turns it off and on" and usually implies starting state
composer.addPass(pencilPass);

// GUI
const gui = new GUI();
const params = {
    'Watercolor': true,
    'Pencil Lines': false,
};

const wcFolder = gui.addFolder('Watercolor Settings');
wcFolder.add(params, 'Watercolor').onChange((val) => { watercolorPass.enabled = val; });
watercolorPass.uniforms.pigment.value = 0.1;
watercolorPass.uniforms.threshold.value = 0.3;
wcFolder.add(watercolorPass.uniforms.pigment, 'value', 0, 5).name('Pigment');
wcFolder.add(watercolorPass.uniforms.threshold, 'value', 0, 1).name('Threshold');
wcFolder.open();

const pencilFolder = gui.addFolder('Pencil Lines Settings');
pencilFolder.add(params, 'Pencil Lines').onChange((val) => { pencilPass.enabled = val; });
pencilPass.uniforms.uThickness.value = 0.05;
pencilPass.uniforms.uThreshold.value = 0.05;
pencilFolder.add(pencilPass.uniforms.uThickness, 'value', 0, 5).name('Thickness');
pencilFolder.add(pencilPass.uniforms.uThreshold, 'value', 0, 1).name('Sensitivity');
pencilFolder.open();

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);

    watercolorPass.uniforms['texel'].value.set(1.0 / window.innerWidth, 1.0 / window.innerHeight);
    pencilPass.uniforms['resolution'].value.set(1.0 / window.innerWidth, 1.0 / window.innerHeight);
});

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // composer.render() replaces renderer.render(scene, camera)
    composer.render();
}

animate();
