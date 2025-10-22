import CONFIG from '../core/config.js';
// Assumiamo che l'istanza di World sia iniettata nel costruttore
// import { World } from '../core/World.js'; 

/**
 * Fornisce un accesso astratto e performante O(logN) ai dati voxel in memoria.
 * Esegue la traduzione delle coordinate mondo e la traversata dell'Octree.
 */
export class VoxelAccessor {
    
    /**
     * @param {World} worldInstance L'istanza del gestore della mappa (World.js).
     */
    constructor(worldInstance) {
        this.world = worldInstance;
        
        // Pre-calcoli per la conversione rapida delle coordinate
        this.chunkSizeMeters = CONFIG.MINI_CHUNK_SIZE_METERS;
        this.chunkSideVoxels = CONFIG.MINI_CHUNK_SIDE_VOXELS;
        this.maxDepth = CONFIG.OCTREE_MAX_DEPTH;
        this.rName = CONFIG.DEFAULT_REGION_NAME; 
    }

    // =================================================================
    // UTILITY PER LE COORDINATE (CORREZIONE DEI MONDI NEGATIVI)
    // =================================================================
    
    /**
     * Calcola il modulo corretto che gestisce i numeri negativi (modulo-floor).
     * Es: getLocalModulo(-5, 16) restituisce 11, non -5.
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
        
        // Coordinate della Regione
        const rx = Math.floor(absCX / CONFIG.REGION_CHUNKS_PER_SIDE_XZ);
        const ry = Math.floor(absCY / CONFIG.REGION_CHUNKS_PER_SIDE_Y);
        const rz = Math.floor(absCZ / CONFIG.REGION_CHUNKS_PER_SIDE_XZ);

        // Coordinate del Mini-Chunk all'interno della Regione (USO CORRETTO DEL MODULO)
        const localCX = this.#getLocalModulo(absCX, CONFIG.REGION_CHUNKS_PER_SIDE_XZ);
        const localCY = this.#getLocalModulo(absCY, CONFIG.REGION_CHUNKS_PER_SIDE_Y);
        const localCZ = this.#getLocalModulo(absCZ, CONFIG.REGION_CHUNKS_PER_SIDE_XZ);
        
        // Indice lineare del Mini-Chunk (0 - 127)
        const chunkIndex = 
            localCX + 
            localCY * CONFIG.REGION_CHUNKS_PER_SIDE_XZ + 
            localCZ * CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.REGION_CHUNKS_PER_SIDE_Y;

        // Coordinate del Voxel all'interno del Mini-Chunk (USO CORRETTO DEL MODULO)
        // Dobbiamo calcolare l'indice voxel assoluto e modularlo.
        const absVX = Math.floor(x / CONFIG.VOXEL_SIZE_METERS);
        const absVY = Math.floor(y / CONFIG.VOXEL_SIZE_METERS);
        const absVZ = Math.floor(z / CONFIG.VOXEL_SIZE_METERS);

        const vx = this.#getLocalModulo(absVX, this.chunkSideVoxels);
        const vy = this.#getLocalModulo(absVY, this.chunkSideVoxels);
        const vz = this.#getLocalModulo(absVZ, this.chunkSideVoxels);
        
        return { rx, ry, rz, chunkIndex, vx, vy, vz };
    }

    // =================================================================
    // LOGICA DI TRAVERSATA DELL'OCTREE
    // =================================================================
    
    /**
     * Esegue la traversata O(logN) sull'Octree per trovare il nodo foglia.
     * @private
     */
    #traverseOctree(node, vx, vy, vz) {
        let currentNode = node;
        let currentLevel = currentNode.level;
        
        // La dimensione logica del cubo rappresentato dal nodo corrente (in voxel base)
        let nodeSize = this.chunkSideVoxels; // Inizia a 16 (Livello 0)
        
        let localX = vx;
        let localY = vy;
        let localZ = vz;
        
        // La traversata iterativa
        // La condizione !currentNode.isLeaf() assicura che scendiamo SOLO se è un nodo MIXED (materialID = 255)
        while (!currentNode.isLeaf() && currentNode.children && currentLevel < this.maxDepth) {
            
            // Determina la metà del volume del nodo corrente
            const halfSize = nodeSize / 2;
            
            // Calcolo dell'indice del figlio (0-7)
            const childIndex = 
                (localX >= halfSize ? 4 : 0) + 
                (localY >= halfSize ? 2 : 0) + 
                (localZ >= halfSize ? 1 : 0);
            
            const nextNode = currentNode.children[childIndex];

            // ROBUSTEZZA: Controlla che il figlio esista (non dovrebbe essere null in un Octree ben formato)
            if (!nextNode) {
                console.error(`Octree traversal failed: Null child found at level ${currentLevel}. Chunk may be corrupted.`);
                // Restituisce il materiale del nodo genitore come fallback, o Aria.
                return { id: CONFIG.VOXEL_ID_AIR, density: 0, level: currentLevel, found: true }; 
            }

            currentNode = nextNode; 
            
            // Aggiorna le coordinate relative per il prossimo livello (modulo/offset)
            localX = localX % halfSize;
            localY = localY % halfSize;
            localZ = localZ % halfSize;
            
            currentLevel++;
            nodeSize = halfSize;
        }

        // Trovato un nodo foglia o raggiunto il livello massimo
        
        // DENSITÀ: Per il DC, è 1 per il Solido, 0 per l'Aria
        const density = (currentNode.materialID !== CONFIG.VOXEL_ID_AIR) ? 1 : 0;
        
        return { 
            id: currentNode.materialID, 
            density: density, 
            level: currentLevel,
            found: true
        };
    }
}