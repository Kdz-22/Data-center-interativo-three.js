import * as THREE from 'three';
import { createBrushedMetal, toTexture, createCanvas } from './materials.js';

// Faixa clara sobre fundo escuro, sem emenda nas pontas, para ladrilhar ao longo do tubo.
// O cilindro tem V ao longo do comprimento, então deslocar offset.y move o pulso pelo cano.
function flowTexture(pulses) {
    const { canvas, ctx } = createCanvas(16, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#202020');
    g.addColorStop(0.7, '#202020');
    g.addColorStop(0.85, '#ffffff');
    g.addColorStop(1, '#202020');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    return toTexture(canvas, 1, pulses, true);
}
// Medidas do vão entre o V2 e o rack (lidas no console): do fundo do V2 (z = 2,93)
// à frente do rack (z = 3,33), 0,4 m de largura, centro em z ≈ 3,13.
const GAP_Z = 3.13;
const GAP_W = 0.4;
const PIPE_R = 0.07;
const UNITS = 14;     // mesmos valores do datacenter.js
const SPACING = 0.8;
// Dois circuitos empilhados no vão. xEnd diferente: as colunas até o teto
// ficam em x distintos e a do circuito de baixo não atravessa o de cima.
const LINES = [
    { name: 'cold', y: 1.75, xEnd: 5.8 },
    { name: 'hot', y: 0.65, xEnd: 6.2 },
];
// Metal escovado com leve brilho da cor do fluido (emissivo), no mesmo
// esquema de bump + roughnessMap usado nos racks.
function pipeMaterial(name, color, emissive, pulses) {
    const brushed = createBrushedMetal();
    const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.9,
        roughness: 0.9, // multiplica o roughnessMap: resultado ≈ 0.45
        roughnessMap: toTexture(brushed, 1, 8, false),
        bumpMap: toTexture(brushed, 1, 8, false),
        bumpScale: 0.4,
        emissive,
        emissiveMap: flowTexture(pulses),
        emissiveIntensity: 0.6,
    });
    mat.name = name;
    return mat;
}

export function createCoolingPipes(room) {
    const group = new THREE.Group();
    group.name = 'cooling';

    const mats = {
        cold: pipeMaterial('pipe-cold', 0x1b3a44, 0x00e5ff, 8),
        hot: pipeMaterial('pipe-hot', 0x44281b, 0xff6a00, 8),
    };
    const flangeMat = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.85, roughness: 0.35 });

    // Geometrias compartilhadas por todos os tubos
    const flangeGeo = new THREE.CylinderGeometry(PIPE_R * 1.4, PIPE_R * 1.4, 0.06, 24);
    const stubGeo = new THREE.CylinderGeometry(PIPE_R * 0.45, PIPE_R * 0.45, GAP_W, 12);
    const jointGeo = new THREE.SphereGeometry(PIPE_R * 1.15, 24, 16);
    const startX = -((UNITS - 1) * SPACING) / 2;

    function add(geo, mat, pos, rot = [0, 0, 0]) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(...pos);
        m.rotation.set(...rot);
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
    }

    for (const line of LINES) {
        const mat = mats[line.name];
        const pipeGeo = new THREE.CylinderGeometry(PIPE_R, PIPE_R, 2 * line.xEnd, 24);
        const riserH = room.height - line.y;
        const riserGeo = new THREE.CylinderGeometry(PIPE_R, PIPE_R, riserH, 24);

        for (const s of [-1, 1]) {
            const z = s * GAP_Z;

            // O cilindro nasce ao longo de Y: 90° em Z deita ao longo de X
            add(pipeGeo, mat, [0, line.y, z], [0, 0, Math.PI / 2]);

            // Em cada unidade: flange no tubo + derivação atravessando o vão (eixo Z)
            for (let i = 0; i < UNITS; i++) {
                const x = startX + i * SPACING;
                add(flangeGeo, flangeMat, [x, line.y, z], [0, 0, Math.PI / 2]);
                add(stubGeo, mat, [x, line.y, z], [Math.PI / 2, 0, 0]);
            }

            // Pontas: junta esférica + coluna até o teto
            for (const x of [-line.xEnd, line.xEnd]) {
                add(jointGeo, mat, [x, line.y, z]);
                add(riserGeo, mat, [x, line.y + riserH / 2, z]);
            }
        }
    }
    // Alimentação e retorno correm em sentidos opostos
    const FLOW_SPEED = 0.5; // pulsos por segundo (~0,75 m/s)
    function update(delta) {
        mats.cold.emissiveMap.offset.y += FLOW_SPEED * delta;
        mats.hot.emissiveMap.offset.y -= FLOW_SPEED * delta;
    }
    return { group, update };
}