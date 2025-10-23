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
import { ImplicitField } from '../meshing/ImplicitField.js';
import { DualContouring } from './meshing/DualContouring.js';
import { VOXEL_ID_AIR } from '../core/palette.js'; // Importato per coerenza

// Importiamo il Marching Cubes qui quando sarà disponibile.
// import { MarchingCubes } from './MarchingCubes.js'; 
export class ChunkManager {

    constructor() {
        // La dimensione della griglia necessaria per Dual Contouring (un punto in più per lato)
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
        
        // --- LOGICA DI DECISIONE E CAMPIONAMENTO ---
        if (chunkOctree /* && è un Octree compresso e non solo FULL_AIR */) {
            
            console.log(`[ChunkManager] Usando Octree (dati salvati) per Chunk (${absCX}, ${absCY}, ${absCZ}). FALLBACK AL NOISE PER TEST.`);
            
            // TODO: Sostituire con la logica di campionamento dell'Octree.
            this.#sampleImplicitField(
                chunkStartMetersX, 
                chunkStartMetersY, 
                chunkStartMetersZ
            );
            
        } else {
            // Usa il campo implicito (Noise) per generare il terreno di base.
            this.#sampleImplicitField(
                chunkStartMetersX, 
                chunkStartMetersY, 
                chunkStartMetersZ
            );
            console.log(`[ChunkManager] Generazione tramite Noise (dati base) per Chunk (${absCX}, ${absCY}, ${absCZ})`);
        }
        
        // 2. Esecuzione dell'algoritmo di Dual Contouring
        const meshData = DualContouring.extractMesh(
            this.densityGrid,
            this.materialGrid,
            this.gridResolution,
            this.voxelSizeMeters
        );

        // 3. Analisi Voxel Pieno/Vuoto e ritorno del risultato
        if (!meshData) {
            return null;
        }
        
        return meshData;
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
                    
                    // Chiama il metodo STATIC di Implicit Field per ottenere i dati
                    const data = ImplicitField.getVoxelDataAtWorldCoords(
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
}