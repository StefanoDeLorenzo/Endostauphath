import CONFIG from '../core/config.js';
// Importa la logica di gestione della cache della mappa (non ancora implementata)
// import { World } from '../core/World.js'; 

/**
 * Fornisce un accesso astratto e performante ai dati voxel in memoria.
 * Gestisce la traduzione delle coordinate e la traversata O(logN) dell'Octree.
 */
export class VoxelAccessor {
    
    /**
     * @param {World} worldInstance L'istanza del gestore della mappa che contiene la cache dei Mini-Chunk attivi.
     */
    constructor(worldInstance) {
        this.world = worldInstance;
        
        // Pre-calcoli per la conversione rapida delle coordinate
        this.chunkSideSize = CONFIG.MINI_CHUNK_SIDE_VOXELS;
        this.chunkSizeMeters = CONFIG.MINI_CHUNK_SIZE_METERS;
    }

    /**
     * Metodo principale per ottenere il valore (materiale ID) di un voxel.
     * @param {number} x Coordinata mondo (metri)
     * @param {number} y Coordinata mondo (metri)
     * @param {number} z Coordinata mondo (metri)
     * @returns {{id: number, density: number, level: number}} ID del materiale, densità e livello di dettaglio trovato.
     */
    getVoxel(x, y, z) {
        
        // 1. TRADUZIONE: Converte le coordinate mondo in coordinate Chunk e Voxel locali.
        const chunkCoords = this.getChunkCoordinates(x, y, z);
        const voxelCoords = this.getVoxelCoordinates(x, y, z);

        // 2. CACHE LOOKUP: Ottiene il Mini-Chunk root node dalla cache del mondo.
        const chunkRootNode = this.world.getChunkFromCache(chunkCoords.cx, chunkCoords.cy, chunkCoords.cz);
        
        if (!chunkRootNode) {
            // Se il chunk non è caricato (o è fuori dall'area attiva), assumiamo Aria per la sicurezza.
            return { id: CONFIG.VOXEL_ID_AIR, density: 0, level: CONFIG.OCTREE_MAX_DEPTH };
        }

        // 3. TRAVERSATA: Scende nell'Octree per trovare il nodo foglia.
        return this.traverseOctree(chunkRootNode, voxelCoords.vx, voxelCoords.vy, voxelCoords.vz);
    }

    /**
     * Converte coordinate mondo (metri) in coordinate Mini-Chunk (indice di regione).
     * @private
     */
    getChunkCoordinates(x, y, z) {
        // (Logica da implementare: Divisione e floor per trovare l'indice del Mini-Chunk)
        const cx = Math.floor(x / this.chunkSizeMeters);
        const cy = Math.floor(y / this.chunkSizeMeters);
        const cz = Math.floor(z / this.chunkSizeMeters);
        return { cx, cy, cz };
    }
    
    /**
     * Converte coordinate mondo (metri) in coordinate Voxel Locali (0-15).
     * @private
     */
    getVoxelCoordinates(x, y, z) {
         // (Logica da implementare: Modulo e mappatura delle coordinate all'interno del Mini-Chunk 0-15)
        // ...
        return { vx: 0, vy: 0, vz: 0 }; 
    }

    /**
     * Esegue la traversata ricorsiva O(logN) sull'Octree.
     * @private
     * @param {OctreeNode} node Nodo corrente.
     * @param {number} vx Coordinata locale x.
     * @param {number} vy Coordinata locale y.
     * @param {number} vz Coordinata locale z.
     */
    traverseOctree(node, vx, vy, vz) {
        let currentNode = node;
        let currentLevel = currentNode.level;
        
        // Calcola la dimensione corrente del cubo rappresentato dal nodo (in termini di voxel base)
        let nodeSize = 1 << (CONFIG.OCTREE_MAX_DEPTH - currentLevel); 

        // Loop fino a raggiungere un nodo foglia
        while (currentLevel < CONFIG.OCTREE_MAX_DEPTH) {
            if (currentNode.isLeaf()) {
                 // Trovato un nodo foglia compresso.
                // Restituiamo il suo ID materiale e assumiamo densità perfetta per la compressione.
                return { 
                    id: currentNode.materialID, 
                    density: currentNode.materialID === CONFIG.VOXEL_ID_AIR ? 0 : 1, 
                    level: currentLevel 
                };
            }

            // Calcolo del figlio: Sfruttiamo i bit di vx, vy, vz per trovare l'indice del figlio (Morton Code)
            const halfSize = nodeSize / 2;
            const childIndex = (vx >= halfSize ? 4 : 0) + (vy >= halfSize ? 2 : 0) + (vz >= halfSize ? 1 : 0);
            
            currentNode = currentNode.children[childIndex];
            currentLevel++;
            nodeSize = halfSize;
            
            // Aggiorna le coordinate relative per il prossimo livello
            vx %= halfSize;
            vy %= halfSize;
            vz %= halfSize;
        }

        // Se raggiungiamo il livello massimo (Livello 9) e non è un nodo foglia,
        // dovremmo leggere direttamente da subVoxelData, ma per ora lo saltiamo.
        return { id: currentNode.materialID, density: 1, level: currentLevel };
    }
}