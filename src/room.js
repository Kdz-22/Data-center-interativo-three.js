import * as THREE from 'three';

// Medidas definidas no M0 (em metros). Origem no centro do piso.
// A sala ocupa x de -10 a 10 e z de -7 a 7.
export const ROOM = { width: 20, depth: 14, height: 5 };

export function createRoom({ width, depth, height } = ROOM) {
  const room = new THREE.Group();
  room.name = 'room';

  // Um material por tipo de superfície (facilita o wireframe, o culling e as texturas do M3)
  const mats = {
    floor: new THREE.MeshStandardMaterial({ color: 0x2b313a, roughness: 0.8, metalness: 0.2 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.9, metalness: 0.1 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x1c2027, roughness: 0.9, metalness: 0.0 }),
  };

  function addPlane(name, w, h, material, position, rotation) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.receiveShadow = true;
    room.add(mesh);
  }

  // PlaneGeometry nasce virado para +Z, então cada plano é girado para olhar PARA DENTRO da sala
  addPlane('floor', width, depth, mats.floor, [0, 0, 0], [-Math.PI / 2, 0, 0]);          // olha para cima
  addPlane('ceiling', width, depth, mats.ceiling, [0, height, 0], [Math.PI / 2, 0, 0]);  // olha para baixo
  addPlane('wall-back', width, height, mats.wall, [0, height / 2, -depth / 2], [0, 0, 0]);
  addPlane('wall-front', width, height, mats.wall, [0, height / 2, depth / 2], [0, Math.PI, 0]);
  addPlane('wall-left', depth, height, mats.wall, [-width / 2, height / 2, 0], [0, Math.PI / 2, 0]);
  addPlane('wall-right', depth, height, mats.wall, [width / 2, height / 2, 0], [0, -Math.PI / 2, 0]);

  return room;
}