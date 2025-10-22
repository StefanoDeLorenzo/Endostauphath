import { World } from './app/core/World.js';
import { VoxelAccessor } from './app/data/VoxelAccessor.js';
import CONFIG from './app/core/config.js'; // Assicurati che CONFIG sia importato

const world = new World();
const accessor = new VoxelAccessor(world); // Inietta World in VoxelAccessor
const logElement = document.getElementById('log');

function log(message) {
    logElement.textContent += `\n[${new Date().toLocaleTimeString()}] ${message}`;
}

document.getElementById('selectDirButton').addEventListener('click', async () => {
    log("Richiesta accesso alla directory...");
    const success = await world.selectGameDirectory();
    if (success) {
        document.getElementById('readAndTestButton').disabled = false;
        log("Accesso alla directory concesso. Pronto per la lettura.");
    } else {
        log("Accesso alla directory negato o non supportato.");
    }
});

document.getElementById('readAndTestButton').addEventListener('click', async () => {
    log("--- Avvio Test di Deserializzazione e Accesso ---");

    const R_NAME = CONFIG.DEFAULT_REGION_NAME; 
    
    // Le coordinate della regione e del chunk che hai generato
    const RX = 0, RY = 0, RZ = 0; 
    
    // 1. Punti di Test in Metri (basati sulla tua funzione implicita)

    // Chunk di superficie (0-63). Usiamo il chunk 0.
    // L'altezza Y=1.5m * 10 voxel = 15m.
    // Terreno sotto 10m (ID 1), Erba sotto 12m (ID 2), Aria sopra 12m (ID 0).
    
    const V_SIZE = CONFIG.VOXEL_SIZE_METERS; // 1.5 metri

    // A. Punto nel TERRENO (dovrebbe essere MaterialID 1)
    // Coor. mondo: 0.5m, 5.0m, 0.5m (Y è sotto 10m)
    const TEST_X_TERRENO = 0.5 * V_SIZE;
    const TEST_Y_TERRENO = 5.0; // 5 metri
    const TEST_Z_TERRENO = 0.5 * V_SIZE;

    // B. Punto nell'ERBA (dovrebbe essere MaterialID 2)
    // Coor. mondo: 0.5m, 11.0m, 0.5m (Y è tra 10m e 12m)
    const TEST_Y_ERBA = 11.0; // 11 metri

    // C. Punto nell'ARIA (dovrebbe essere MaterialID 0)
    // Coor. mondo: 0.5m, 15.0m, 0.5m (Y è sopra 12m)
    const TEST_Y_ARIA = 15.0; // 15 metri

    // 2. ESECUZIONE DEI TEST
    await runTestPoint(TEST_X_TERRENO, TEST_Y_TERRENO, TEST_Z_TERRENO, 1, "TERRENO");
    await runTestPoint(TEST_X_TERRENO, TEST_Y_ERBA, TEST_Z_TERRENO, 2, "ERBA");
    await runTestPoint(TEST_X_TERRENO, TEST_Y_ARIA, TEST_Z_TERRENO, CONFIG.VOXEL_ID_AIR, "ARIA");
    
    // 3. Verifica di un CHUNK ALTROVE (Chunk 64-127 sono compressi a 2 byte)
    // Cerchiamo un punto nel mondo che cada nel Chunk 64.
    // Dobbiamo calcolare le coordinate del mondo per quel chunk. (Assumiamo che Chunk 64 sia sopra la superficie)
    // Se la tua generazione è solo a y=0, Chunk 64 probabilmente è tutto aria (ID 0).
    const CHUNK64_START_X = CONFIG.MINI_CHUNK_SIZE_METERS * 4; // Esempio
    const CHUNK64_TEST_Y = 25.0; // 25 metri

    await runTestPoint(CHUNK64_START_X + 1.0, CHUNK64_TEST_Y, 1.0, CONFIG.VOXEL_ID_AIR, "CHUNK 64 (Aria)"); 


    log("--- Test Completato ---");
});


async function runTestPoint(x, y, z, expectedID, name) {
    try {
        const info = await accessor.getVoxelInfo(x, y, z);
        const status = info.id === expectedID ? "✅ SUCCESSO" : "❌ FALLITO";
        
        log(`Test [${name}] - Coord: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
        log(`\t> Trovato ID: ${info.id} (Livello ${info.level}). Atteso: ${expectedID}. ${status}`);
    } catch (e) {
        log(`Test [${name}] - ERRORE: ${e.message}`);
    }
}
