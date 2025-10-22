/**
 * ChunkManager.js
 * * Classe responsabile di orchestrare la generazione della mesh per un singolo Mini-Chunk (16x16x16 voxels).
 * * Le sue responsabilità principali sono:
 * 1. Determinare le coordinate mondo del Chunk.
 * 2. Ricevere l'Octree del Chunk dal World (World.js).
 * 3. DECIDERE: Se Octree -> Usa Dati Salvati; Se Mancante -> Usa Generazione Noise.
 * 4. Campionare la Densità e il Materiale per Marching Cubes.
 */
import CONFIG from '../core/config.js';
import { ImplicitField } from '../generator/ImplicitField.js';
import { VOXEL_ID_AIR } from '../core/palette.js'; // Importato per coerenza

// Importiamo il Marching Cubes qui quando sarà disponibile.
// import { MarchingCubes } from './MarchingCubes.js'; 

export class ChunkManager {

    constructor() {
        this.implicitField = new ImplicitField();
        
        // La dimensione della griglia necessaria per Marching Cubes (un punto in più per lato)
        this.gridResolution = CONFIG.MINI_CHUNK_SIDE_VOXELS + 1; // 16 + 1 = 17
        
        // I dati campionati: una griglia 3D di Densità e ID Materiale
        this.densityGrid = new Float32Array(this.gridResolution ** 3);
        this.materialGrid = new Uint8Array(this.gridResolution ** 3);
        
        this.voxelSizeMeters = CONFIG.VOXEL_SIZE_METERS;
    }

    /**
     * Genera la mesh di un Mini-Chunk. La logica di generazione si basa sull'Octree fornito.
     * @param {number} absCX - Indice assoluto X del Mini-Chunk (Chunk World Coordinate X)
     * @param {number} absCY - Indice assoluto Y del Mini-Chunk
     * @param {number} absCZ - Indice assoluto Z del Mini-Chunk
     * @param {object | null} chunkOctree - L'Octree del chunk (se salvato/modificato) o null/placeholder.
     * @returns {{vertices: Float32Array, normals: Float32Array, colors: Float32Array, indices: Uint32Array} | null}
     */
    generateMesh(absCX, absCY, absCZ, chunkOctree) {
        
        // 1. Calcola le coordinate mondo del vertice iniziale del chunk
        const chunkStartMetersX = absCX * CONFIG.MINI_CHUNK_SIZE_METERS;
        const chunkStartMetersY = absCY * CONFIG.MINI_CHUNK_SIZE_METERS;
        const chunkStartMetersZ = absCZ * CONFIG.MINI_CHUNK_SIZE_METERS;
        
        // --- LOGICA DI DECISIONE ---
        if (chunkOctree /* && è un Octree compresso e non solo FULL_AIR */) {
            
            // TODO: In futuro, qui attraverseremo l'Octree (fino al livello 0) per estrarre la Densità e il Materiale.
            // Per il momento, se c'è un Octree, assumiamo che sia necessario generare la mesh
            console.log(`[ChunkManager] Usando Octree (dati salvati) per Chunk (${absCX}, ${absCY}, ${absCZ})`);
            
            // Per ora, come test, forziamo il campionamento del noise anche se l'Octree è presente.
            // Questo sarà sostituito dalla logica di traversata dell'Octree.
            this.#sampleImplicitField(
                chunkStartMetersX, 
                chunkStartMetersY, 
                chunkStartMetersZ
            );
            
        } else {
            // Se l'Octree non è fornito (o è un placeholder "puro" che non ha bisogno di mesh),
            // usiamo il campo implicito per generare il terreno di base.
            
            // 2. Campionamento della griglia 17x17x17 (Densità e Materiali)
            this.#sampleImplicitField(
                chunkStartMetersX, 
                chunkStartMetersY, 
                chunkStartMetersZ
            );
            console.log(`[ChunkManager] Generazione tramite Noise (dati base) per Chunk (${absCX}, ${absCY}, ${absCZ})`);
        }
        
        // 3. Esecuzione dell'algoritmo di Marching Cubes
        // TODO: Chiamare MarchingCubes.extractMesh(...)
        
        // 4. Analisi Voxel Pieno/Vuoto per ottimizzazione
        // In futuro, analizzeremo la densityGrid. Se è tutta <= 0.0 (aria) o tutta > 1.0 (solido), 
        // non genereremo la mesh.

        return null; 
    }

    /**
     * Esegue il campionamento della funzione di campo implicito per popolare le griglie.
     * Questa funzione sarà il FALLBACK quando l'Octree non è disponibile.
     * @private
     */
    #sampleImplicitField(startX, startY, startZ) {
        let index = 0;
        
        // Itera sulla griglia 17x17x17
        for (let y = 0; y < this.gridResolution; y++) {
            for (let z = 0; z < this.gridResolution; z++) {
                for (let x = 0; x < this.gridResolution; x++) {
                    
                    // Calcola la coordinata mondo esatta del vertice di campionamento
                    const worldX = startX + x * this.voxelSizeMeters;
                    const worldY = startY + y * this.voxelSizeMeters;
                    const worldZ = startZ + z * this.voxelSizeMeters;
                    
                    // Chiama l'Implicit Field per ottenere i dati
                    const data = this.implicitField.getVoxelDataAtWorldCoords(
                        worldX, worldY, worldZ
                    );

                    // Memorizza la Densità e l'ID Materiale nella griglia piatta
                    this.densityGrid[index] = data.density;
                    this.materialGrid[index] = data.materialID;
                    
                    index++;
                }
            }
        }
    }
    
    /**
     * Esegue il campionamento della densità basandosi su un Octree esistente.
     * (Questa funzione è un TODO complesso per quando avremo l'algoritmo di traversata)
     * @private
     */
    /*
    #sampleFromOctree(startX, startY, startZ, octree) {
        // ... Logica per traversare l'Octree e trovare la densità/materiale per ogni 
        // voxel 1x1x1 nella griglia 17x17x17
    }
    */
}
