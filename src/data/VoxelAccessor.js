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
        this.rName = CONFIG.DEFAULT_REGION_NAME; // Assume la dimensione di default, modificabile in gioco
    }

    // =================================================================
    // METODO PUBBLICO DI ACCESSO
    // =================================================================

    /**
     * Ottiene le informazioni del voxel/materiale in un punto specifico.
     * @async
     * @param {number} x Coordinata mondo in metri.
     * @param {number} y Coordinata mondo in metri.
     * @param {number} z Coordinata mondo in metri.
     * @returns {Promise<{id: number, density: number, level: number, found: boolean}>} 
     * ID del materiale, densità e livello di dettaglio trovato.
     */
    async getVoxelInfo(x, y, z) {
        
        // 1. Converte le coordinate mondo in coordinate Regione, Chunk e Voxel locali.
        const coords = this.getChunkAndVoxelCoords(x, y, z);

        // 2. Ottiene la radice del Mini-Chunk (carica se necessario)
        const chunkRootNode = await this.world.getMiniChunkRoot(
            this.rName, coords.rx, coords.ry, coords.rz, coords.chunkIndex
        );
        
        if (!chunkRootNode) {
            // Se il chunk non è caricato/esiste, è Aria.
            return { id: CONFIG.VOXEL_ID_AIR, density: 0, level: 0, found: false };
        }

        // 3. Esegue la traversata O(logN) sull'Octree.
        return this.traverseOctree(chunkRootNode, coords.vx, coords.vy, coords.vz);
    }

    // =================================================================
    // LOGICA DI TRADUZIONE DELLE COORDINATE
    // =================================================================

    /**
     * Converte le coordinate mondo in metri in indici Region/Chunk/Voxel.
     * @private
     */
    getChunkAndVoxelCoords(x, y, z) {
        // Coordinate Mini-Chunk nel mondo (indice assoluto)
        const absCX = Math.floor(x / this.chunkSizeMeters);
        const absCY = Math.floor(y / this.chunkSizeMeters);
        const absCZ = Math.floor(z / this.chunkSizeMeters);
        
        // Coordinate della Regione (dividi per la cardinalità della Regione)
        const rx = Math.floor(absCX / CONFIG.REGION_CHUNKS_PER_SIDE_XZ);
        const ry = Math.floor(absCY / CONFIG.REGION_CHUNKS_PER_SIDE_Y);
        const rz = Math.floor(absCZ / CONFIG.REGION_CHUNKS_PER_SIDE_XZ);

        // Coordinate del Mini-Chunk all'interno della Regione (0-7 per XZ, 0-1 per Y)
        const localCX = absCX % CONFIG.REGION_CHUNKS_PER_SIDE_XZ;
        const localCY = absCY % CONFIG.REGION_CHUNKS_PER_SIDE_Y;
        const localCZ = absCZ % CONFIG.REGION_CHUNKS_PER_SIDE_XZ;
        
        // Indice lineare del Mini-Chunk (0 - 127)
        const chunkIndex = 
            localCX + 
            localCY * CONFIG.REGION_CHUNKS_PER_SIDE_XZ + 
            localCZ * CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.REGION_CHUNKS_PER_SIDE_Y;

        // Coordinate del Voxel all'interno del Mini-Chunk (0-15)
        const vx = Math.floor((x % this.chunkSizeMeters) / CONFIG.VOXEL_SIZE_METERS);
        const vy = Math.floor((y % this.chunkSizeMeters) / CONFIG.VOXEL_SIZE_METERS);
        const vz = Math.floor((z % this.chunkSizeMeters) / CONFIG.VOXEL_SIZE_METERS);
        
        return { rx, ry, rz, chunkIndex, vx, vy, vz };
    }

    // =================================================================
    // LOGICA DI TRAVERSATA DELL'OCTREE
    // =================================================================
    
    /**
     * Esegue la traversata O(logN) sull'Octree per trovare il nodo foglia.
     * @private
     * @param {OctreeNode} node Nodo radice del Mini-Chunk.
     * @param {number} vx Coordinata voxel locale (0-15) all'interno del Mini-Chunk.
     * @param {number} vy Coordinata voxel locale (0-15).
     * @param {number} vz Coordinata voxel locale (0-15).
     */
    traverseOctree(node, vx, vy, vz) {
        let currentNode = node;
        let currentLevel = currentNode.level;
        
        // La dimensione logica del cubo rappresentato dal nodo corrente (in voxel base)
        let nodeSize = this.chunkSideVoxels >> currentLevel; // 16, 8, 4, 2, 1, 0.5, 0.25...
        
        let localX = vx;
        let localY = vy;
        let localZ = vz;
        
        // La traversata ricorsiva (o iterativa, come in questo caso)
        while (!currentNode.isLeaf() && currentNode.children && currentLevel < this.maxDepth) {
            
            // Determina la metà del volume del nodo corrente
            const halfSize = nodeSize / 2;
            
            // Calcolo dell'indice del figlio (Morton Code / Z-Order)
            // [0, 1] -> [2, 3] -> [4, 5] -> [6, 7]
            const childIndex = 
                (localX >= halfSize ? 4 : 0) + 
                (localY >= halfSize ? 2 : 0) + 
                (localZ >= halfSize ? 1 : 0);
            
            currentNode = currentNode.children[childIndex];
            
            // Aggiorna le coordinate relative per il prossimo livello (modulo/offset)
            localX %= halfSize;
            localY %= halfSize;
            localZ %= halfSize;
            
            currentLevel++;
            nodeSize = halfSize;
        }

        // Trovato un nodo foglia o raggiunto il livello massimo
        
        // TODO: Aggiungere qui la logica per leggere da subVoxelData al Livello 9
        
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