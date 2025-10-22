import CONFIG from './app/core/config.js';
import { World } from './app/core/World.js';
import { VoxelGenerator } from './tools/VoxelGenerator.js';
import { OctreeSerializer } from './app/data/OctreeSerializer.js';

const world = new World();
const generator = new VoxelGenerator();
const logElement = document.getElementById('log');

function log(message) {
    logElement.textContent += `\n[${new Date().toLocaleTimeString()}] ${message}`;
}

document.getElementById('selectDirButton').addEventListener('click', async () => {
    log("Richiesta accesso alla directory...");
    const success = await world.selectGameDirectory();
    if (success) {
        document.getElementById('generateAndSaveButton').disabled = false;
        log("Accesso alla directory concesso. Pronto per la generazione.");
    } else {
        log("Accesso alla directory negato o non supportato.");
    }
});

document.getElementById('generateAndSaveButton').addEventListener('click', async () => {
    log("--- Avvio Generazione e Salvataggio ---");

    const R_NAME = CONFIG.DEFAULT_REGION_NAME; // "Overworld di default"
    const RX = 0, RY = 0, RZ = 0;
    
    // Creiamo una nuova istanza di RegionFile in RAM
    const regionFile = await world.getRegionFile(R_NAME, RX, RY, RZ);
    
    let totalSize = 0;
    
    // Generazione di tutti i 128 Mini-Chunk
    for (let chunkIndex = 0; chunkIndex < CONFIG.REGION_TOTAL_CHUNKS; chunkIndex++) {
        log(`Generazione Mini-Chunk #${chunkIndex}...`);
        
        // 1. GENERA: Costruisce l'albero OctreeNode
        const rootNode = generator.generateChunk(R_NAME, RX, RY, RZ, chunkIndex);

        // 2. SERIALIZZA: Converte l'albero in ArrayBuffer
        const buffer = OctreeSerializer.serialize(rootNode);
        
        // 3. AGGIORNA RAM: Inserisce il buffer nel RegionFile in RAM
        regionFile.updateChunkData(chunkIndex, buffer, buffer.byteLength);
        
        totalSize += buffer.byteLength;
    }

    log(`Generazione completata. Dimensione totale dei chunk: ${totalSize} byte.`);

    // 4. SALVA: Scrive l'intero file regione su disco locale.
    log(`Scrittura del file R_${R_NAME}_${RX}_${RY}_${RZ}.rgn su disco...`);
    await world.saveRegionFileToDisk(regionFile);
    log("Salvataggio Completato!");
});