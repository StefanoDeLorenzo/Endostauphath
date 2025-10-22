import CONFIG from '../core/config.js';

/**
 * Fornisce un accesso astratto e performante O(logN) ai dati voxel in memoria.
 * Esegue la traduzione delle coordinate mondo e la traversata dell'Octree.
 */
export class VoxelAccessor {
    
    constructor(worldInstance) {
        this.world = worldInstance;
        
        // Pre-calcoli per la conversione rapida delle coordinate
        this.chunkSizeMeters = CONFIG.MINI_CHUNK_SIZE_METERS;
        this.chunkSideVoxels = CONFIG.MINI_CHUNK_SIDE_VOXELS;
        this.maxDepth = CONFIG.OCTREE_MAX_DEPTH;
        this.rName = CONFIG.DEFAULT_REGION_NAME; 
        
        // Calcolo della dimensione del piano XZ (8 * 8 = 64)
        this.xzPlaneSize = CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.REGION_CHUNKS_PER_SIDE_XZ;
    }

    // =================================================================
    // UTILITY PER LE COORDINATE (CORREZIONE DEI MONDI NEGATIVI)
    // =================================================================
    
    /**
     * Calcola il modulo corretto che gestisce i numeri negativi (modulo-floor).
     * @private
     */
    #getLocalModulo(dividend, divisor) {
        const result = dividend % divisor;
        return result < 0 ? result + divisor : result;
    }

    // =================================================================
    // METODO PUBBLICO DI ACCESSO
    // =================================================================

    /**
     * Ottiene le informazioni del voxel/materiale in un punto specifico.
     * @async
     */
    async getVoxelInfo(x, y, z) {
        
        // 1. Converte le coordinate mondo in coordinate Regione, Chunk e Voxel locali.
        const coords = this.#getChunkAndVoxelCoords(x, y, z);
        
        // *** DEBUG: Traccia l'accesso per il test del Chunk 64 ***
        if (coords.chunkIndex === 64) {
             console.warn(`[ACCESSOR DEBUG] Accesso a Y=${y.toFixed(2)}m. Calcolato: Chunk Index ${coords.chunkIndex}.`);
        }
        
        // 2. Ottiene la radice del Mini-Chunk (carica se necessario)
        const chunkRootNode = await this.world.getMiniChunkRoot(
            this.rName, coords.rx, coords.ry, coords.rz, coords.chunkIndex
        );
        
        if (!chunkRootNode) {
            // Se il chunk non è caricato/esiste, è Aria.
            return { id: CONFIG.VOXEL_ID_AIR, density: 0, level: 0, found: false };
        }

        // 3. Esegue la traversata O(logN) sull'Octree.
        return this.#traverseOctree(chunkRootNode, coords.vx, coords.vy, coords.vz);
    }

    // =================================================================
    // LOGICA DI TRADUZIONE DELLE COORDINATE
    // =================================================================

    /**
     * Converte le coordinate mondo in metri in indici Region/Chunk/Voxel.
     * @private
     */
    #getChunkAndVoxelCoords(x, y, z) {
        // Coordinate Mini-Chunk nel mondo (indice assoluto)
        const absCX = Math.floor(x / this.chunkSizeMeters);
        const absCY = Math.floor(y / this.chunkSizeMeters);
        const absCZ = Math.floor(z / this.chunkSizeMeters);
        
        // Coordinate della Regione (Assumendo Region side size per Y sia 2)
        const rx = Math.floor(absCX / CONFIG.REGION_CHUNKS_PER_SIDE_XZ);
        const ry = Math.floor(absCY / CONFIG.REGION_CHUNKS_PER_SIDE_Y);
        const rz = Math.floor(absCZ / CONFIG.REGION_CHUNKS_PER_SIDE_XZ);

        // Coordinate del Mini-Chunk all'interno della Regione
        const localCX = this.#getLocalModulo(absCX, CONFIG.REGION_CHUNKS_PER_SIDE_XZ);
        const localCY = this.#getLocalModulo(absCY, CONFIG.REGION_CHUNKS_PER_SIDE_Y);
        const localCZ = this.#getLocalModulo(absCZ, CONFIG.REGION_CHUNKS_PER_SIDE_XZ);
        
        // 🚨 CORREZIONE QUI: L'indice Y (localCY) deve moltiplicare l'area XZ (64)
        const chunkIndex = 
            localCX + 
            (localCZ * CONFIG.REGION_CHUNKS_PER_SIDE_XZ) + // Z è il secondo indice (moltiplica per 8)
            (localCY * this.xzPlaneSize); // Y è l'indice più lento (moltiplica per 64)

        // Coordinate del Voxel all'interno del Mini-Chunk
        const absVX = Math.floor(x / CONFIG.VOXEL_SIZE_METERS);
        const absVY = Math.floor(y / CONFIG.VOXEL_SIZE_METERS);
        const absVZ = Math.floor(z / CONFIG.VOXEL_SIZE_METERS);

        const vx = this.#getLocalModulo(absVX, this.chunkSideVoxels);
        const vy = this.#getLocalModulo(absVY, this.chunkSideVoxels);
        const vz = this.#getLocalModulo(absVZ, this.chunkSideVoxels);
        
        return { rx, ry, rz, chunkIndex, vx, vy, vz };
    }

    // =================================================================
    // LOGICA DI TRAVERSATA DELL'OCTREE (Lasciata intatta)
    // =================================================================
    
    /**
     * Esegue la traversata O(logN) sull'Octree per trovare il nodo foglia.
     * @private
     */
    #traverseOctree(node, vx, vy, vz) {
        let currentNode = node;
        let currentLevel = currentNode.level;
        let nodeSize = this.chunkSideVoxels; 
        
        let localX = vx;
        let localY = vy;
        let localZ = vz;
        
        // La condizione !currentNode.isLeaf() è equivalente a currentNode.materialID === VOXEL_ID_CUT
        while (!currentNode.isLeaf() && currentNode.children && currentLevel < this.maxDepth) {
            const halfSize = nodeSize / 2;
            
            // Calcolo dell'indice del figlio (0-7)
            const childIndex = 
                (localX >= halfSize ? 4 : 0) + 
                (localY >= halfSize ? 2 : 0) + 
                (localZ >= halfSize ? 1 : 0);
            
            const nextNode = currentNode.children[childIndex];

            if (!nextNode) {
                console.error(`Octree traversal failed: Null child found at level ${currentLevel}. Chunk may be corrupted.`);
                return { id: CONFIG.VOXEL_ID_AIR, density: 0, level: currentLevel, found: true }; 
            }

            currentNode = nextNode; 
            
            // Aggiorna le coordinate relative
            localX = localX % halfSize;
            localY = localY % halfSize;
            localZ = localZ % halfSize;
            
            currentLevel++;
            nodeSize = halfSize;
        }
        
        const density = (currentNode.materialID !== CONFIG.VOXEL_ID_AIR) ? 1 : 0;
        
        return { 
            id: currentNode.materialID, 
            density: density, 
            level: currentLevel,
            found: true
        };
    }
}