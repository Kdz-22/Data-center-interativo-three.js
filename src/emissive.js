// Faz a textura difusa brilhar sozinha: emissiveMap = a própria textura.
// Partes escuras continuam escuras; LEDs e telas (partes claras) brilham.
export function makeTexturesGlow(root, intensities) {
    const found = {};
    root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) {
            const k = intensities[m.name];
            if (k && m.map) {
                m.emissive.set(0xffffff);
                m.emissiveMap = m.map;
                m.emissiveIntensity = k;
                m.needsUpdate = true;
                found[m.name] = m;
            }
        }
    });
    return found;
}

export function addEmissiveGui(gui, glow) {
    const f = gui.addFolder('Materiais emissivos');
    if (glow.Cube12_auv) f.add(glow.Cube12_auv, 'emissiveIntensity', 0, 2).name('LEDs dos servidores');
    if (glow.console_auv) f.add(glow.console_auv, 'emissiveIntensity', 0, 3).name('tela do console');
}