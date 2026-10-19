import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Pastas e arquivos (relativos a public/)
const DRAG_DROP_DIR = '/rack/drag_and_drop_server_racks/drag_and_drop_server_racks/';
const SERVER_V2_DIR = '/rack/server-v2-console/source/694887b78f894c64b7eb1e5fcac59102/';
const ROBOT_PATH = '/robot/RobotExpressive.glb';
const SERVER_GLTF_PATH = '/server/server_racking_system/scene.gltf';

const gltfLoader = new GLTFLoader();

// Carrega um OBJ, com MTL opcional
async function loadOBJ(dir, objFile, mtlFile = null) {
    const objLoader = new OBJLoader().setPath(dir);

    if (mtlFile) {
        const materials = await new MTLLoader().setPath(dir).loadAsync(mtlFile);
        materials.preload();
        objLoader.setMaterials(materials);
    }

    const obj = await objLoader.loadAsync(objFile);
    prepare(obj);
    return obj;
}

function setMaterial(root, material) {
    root.traverse((o) => {
        if (o.isMesh) o.material = material;
    });
}

// Rack completo (OBJs do HippoDevelopment): carcaça + 5 servidores com doodads.
// O grupo devolvido tem a origem na BASE (y = 0) e ~6 unidades de altura.
export async function loadRackAssembly() {
    const [rackMesh, serverMesh, doodadsMesh] = await Promise.all([
        loadOBJ(DRAG_DROP_DIR, 'server_rack.obj'),
        loadOBJ(DRAG_DROP_DIR, 'server.obj'),
        loadOBJ(DRAG_DROP_DIR, 'server_doodads.obj'),
    ]);

    // Sem UV nem MTL: materiais provisórios (cores vindas dos .tres do Godot)
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x006274, roughness: 0.5, metalness: 0.4 });
    const serverMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 });
    const doodadsMat = new THREE.MeshStandardMaterial({ color: 0x0a2a1a, roughness: 0.5, metalness: 0.3 });

    const group = new THREE.Group();
    group.name = 'rack';

    setMaterial(rackMesh, rackMat);
    rackMesh.position.y = 3; // o OBJ é centrado no meio, então sobe metade da altura
    group.add(rackMesh);

    for (let i = -2; i <= 2; i++) {
        const unit = new THREE.Group();
        const server = serverMesh.clone();
        const doodads = doodadsMesh.clone();
        setMaterial(server, serverMat);
        setMaterial(doodads, doodadsMat);
        unit.add(server, doodads);
        unit.position.y = 3 + i;
        group.add(unit);
    }
    return group;
}

// ServerV2 + console (OBJ + MTL, com texturas e UV)
export const loadServerV2Console = () =>
    loadOBJ(SERVER_V2_DIR, 'ServerV2_console.obj', 'ServerV2_console.mtl');

// Robô (GLB): devolve o gltf completo (scene + animations)
export async function loadRobot() {
    const gltf = await gltfLoader.loadAsync(ROBOT_PATH);
    prepare(gltf.scene);
    return gltf;
}

// Servidor em destaque (glTF)
export async function loadServerGLTF() {
    const gltf = await gltfLoader.loadAsync(SERVER_GLTF_PATH);
    prepare(gltf.scene);
    return gltf.scene;
}

// Ajusta a escala pela altura desejada (em metros).
// Ignora SkinnedMesh na medição: a bounding box delas é imprecisa
// (no robô, as mãos inflam a altura em ~30x).
export function fitToHeight(obj, targetHeight) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();

    obj.traverse((o) => {
        if (o.isMesh && !o.isSkinnedMesh) {
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
            box.union(tmp);
        }
    });

    const size = box.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(targetHeight / size.y);
}

function prepare(root) {
    root.traverse((o) => {
        if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
}