import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Navegação em primeira pessoa.
//
// Regra do projeto: o movimento NÃO pode depender do frame rate.
// Por isso todas as velocidades estão em "unidades por segundo" (1 unidade = 1 metro)
// ou "radianos por segundo", e são multiplicadas pelo delta (segundos desde o último quadro),
// que vem do THREE.Timer no loop principal.
//
//   deslocamento neste quadro = velocidade (m/s) × delta (s)
//
// A 30 fps o delta é ~0,033 s; a 144 fps é ~0,007 s. Os passos ficam menores ou maiores,
// mas a distância percorrida em 1 segundo é a mesma.
//
// O mouse é a exceção: ele não é integrado no tempo, cada evento de movimento já é
// um ângulo (pixels × sensibilidade). Por isso também há rotação pelas setas, em rad/s.

const UP = new THREE.Vector3(0, 1, 0);

export class FirstPersonController {
    constructor(camera, domElement, options = {}) {
        this.camera = camera;

        this.eyeHeight = options.eyeHeight ?? 1.7;               // altura dos olhos (m)
        this.walkSpeed = options.walkSpeed ?? 3.0;               // m/s
        this.runMultiplier = options.runMultiplier ?? 2.0;       // Shift
        this.turnSpeed = options.turnSpeed ?? THREE.MathUtils.degToRad(90); // rad/s (setas)
        this.bounds = options.bounds ?? null;                    // { minX, maxX, minZ, maxZ }
        this.keepInside = true;                                  // prende a câmera dentro da sala
        this.maxDelta = options.maxDelta ?? 0.25;                // maior passo aceito por quadro (s)

        // PointerLockControls cuida de capturar o mouse e girar a câmera (yaw/pitch).
        this.pointerLock = new PointerLockControls(camera, domElement);
        this.pointerLock.pointerSpeed = options.mouseSensitivity ?? 1.0;

        this.keys = new Set();
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._move = new THREE.Vector3();
        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

        this._onKeyDown = (e) => {
            if (isTyping(e)) return;
            this.keys.add(e.code);
            if (e.code.startsWith('Arrow')) e.preventDefault(); // evita rolar a página
        };
        this._onKeyUp = (e) => this.keys.delete(e.code);
        this._onBlur = () => this.keys.clear(); // trocar de aba com tecla presa não deixa a câmera andando

        addEventListener('keydown', this._onKeyDown);
        addEventListener('keyup', this._onKeyUp);
        addEventListener('blur', this._onBlur);
        domElement.addEventListener('click', () => this.pointerLock.lock());

        camera.position.y = this.eyeHeight;
    }

    get isLocked() {
        return this.pointerLock.isLocked;
    }

    // Chamado uma vez por quadro com o delta do THREE.Timer.
    update(delta) {
        // Limita o delta: se o navegador travar por um instante (ou a aba voltar do
        // segundo plano), o primeiro quadro teria um delta enorme e a câmera "teleportaria".
        // 0,25 s só interfere abaixo de 4 fps; acima disso o movimento é exato.
        const dt = Math.min(delta, this.maxDelta);
        const k = this.keys;

        // --- Rotação pelas setas (rad/s × s = rad) ---
        const yawInput = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
        const pitchInput = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
        if (yawInput || pitchInput) {
            this._euler.setFromQuaternion(this.camera.quaternion);
            this._euler.y += yawInput * this.turnSpeed * dt;
            this._euler.x += pitchInput * this.turnSpeed * dt;
            const limit = THREE.MathUtils.degToRad(85); // não deixa a câmera virar de cabeça para baixo
            this._euler.x = THREE.MathUtils.clamp(this._euler.x, -limit, limit);
            this.camera.quaternion.setFromEuler(this._euler);
        }

        // --- Deslocamento (m/s × s = m) ---
        const forwardInput = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
        const strafeInput = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
        if (forwardInput || strafeInput) {
            // Direção para onde a câmera olha, projetada no plano do chão (y = 0):
            // olhar para cima ou para baixo não faz a câmera voar nem afundar.
            this.camera.getWorldDirection(this._forward);
            this._forward.y = 0;
            this._forward.normalize();
            this._right.crossVectors(this._forward, UP).normalize();

            this._move
                .copy(this._forward).multiplyScalar(forwardInput)
                .addScaledVector(this._right, strafeInput);

            // Normaliza para andar na diagonal não ser √2 vezes mais rápido.
            this._move.normalize();

            const running = k.has('ShiftLeft') || k.has('ShiftRight');
            const speed = this.walkSpeed * (running ? this.runMultiplier : 1);
            this.camera.position.addScaledVector(this._move, speed * dt);
        }

        // Mantém a altura dos olhos e, se ligado, a câmera dentro das paredes.
        // Não é colisão com os objetos (o enunciado dispensa), só um limite retangular.
        this.camera.position.y = this.eyeHeight;
        if (this.keepInside && this.bounds) {
            const b = this.bounds;
            this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, b.minX, b.maxX);
            this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, b.minZ, b.maxZ);
        }
    }
}

function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}