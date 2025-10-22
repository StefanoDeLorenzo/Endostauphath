import { OctreeNode } from '../data/OctreeNode.js';
import CONFIG from '../core/config.js';

/**
 * Genera dati voxel iniziali per un Mini-Chunk utilizzando funzioni implicite.
 * Il suo compito è costruire l'albero OctreeNode, potandolo dove possibile.
 */
export class VoxelGenerator {
    
    /**
     * @param {number} rName Il nome della regione (Dimensione)
     * @param {number} rx, ry, rz Coordinate della Regione
     * @param {number} chunkIndex Indice locale del Mini-Chunk (0-127)
     * @returns {OctreeNode} La radice dell'Octree per il Mini-Chunk generato.
     */
    generateChunk(rName, rx, ry, rz, chunkIndex) {
        // La generazione del chunk inizia sempre dalla radice (Livello 0)
        return this.#generateNodeRecursive(
            0, // Livello 0
            0, 0, 0, // Coordinate locali (0, 0, 0) relative al chunk
            CONFIG.MINI_CHUNK_SIDE_VOXELS, // Lato iniziale in voxel (16)
            rx, ry, rz, chunkIndex
        );
    }

    /**
     * Determina se un volume è uniforme, solido, o misto.
     * @private
     */
    #generateNodeRecursive(level, vx, vy, vz, size, rx, ry, rz, chunkIndex) {
        
        // 1. Raggiunto il livello base del voxel (Livello 4/5)
        if (size <= 1) { 
            // Questo è il livello di campionamento più fine per il Dual Contouring.
            const materialID = this.#getMaterialAtVoxel(rx, ry, rz, chunkIndex, vx, vy, vz);
            
            // Il nodo foglia finale non può essere ulteriormente suddiviso.
            return new OctreeNode(level, materialID); 
        }

        // 2. Genera gli 8 figli
        const halfSize = size / 2;
        const children = [];
        let firstMaterialID = -1;
        let isMixed = false;
        
        for (let i = 0; i < 8; i++) {
            // Calcola l'offset locale per il figlio
            const offsetX = (i & 4) ? halfSize : 0;
            const offsetY = (i & 2) ? halfSize : 0;
            const offsetZ = (i & 1) ? halfSize : 0;
            
            const childNode = this.#generateNodeRecursive(
                level + 1, 
                vx + offsetX, vy + offsetY, vz + offsetZ, 
                halfSize, rx, ry, rz, chunkIndex
            );
            
            children.push(childNode);

            // Controlla se il volume è omogeneo
            if (childNode.isLeaf()) {
                if (firstMaterialID === -1) {
                    firstMaterialID = childNode.materialID;
                } else if (firstMaterialID !== childNode.materialID) {
                    isMixed = true;
                }
            } else {
                isMixed = true; // Se un figlio non è una foglia, l'attuale è misto
            }
        }

        // 3. Potatura (Pruning)
        if (!isMixed && firstMaterialID !== -1) {
            // Tutti gli 8 figli sono foglie e hanno lo stesso materialID.
            // Ritorna una singola foglia al posto di 8 per massima compressione.
            return new OctreeNode(level, firstMaterialID);
        }

        // 4. Nodo Misto (MIXED)
        const parentNode = new OctreeNode(level, 0);
        parentNode.initializeChildren();
        parentNode.children = children;
        return parentNode;
    }

    /**
     * Funzione fittizia per ottenere il Material ID in un punto specifico del Voxel.
     * Questa è la funzione implicita che definisce la geometria del mondo.
     * @private
     */
    #getMaterialAtVoxel(rx, ry, rz, chunkIndex, vx, vy, vz) {
        // Esempio: Generazione di un semplice piano inclinato
        const worldY = (ry * CONFIG.REGION_CHUNKS_PER_SIDE_Y + this.#getLocalYFromIndex(chunkIndex) * CONFIG.MINI_CHUNK_SIDE_VOXELS + vy) * CONFIG.VOXEL_SIZE_METERS;
        
        // Se l'altezza del mondo è sotto un certo livello
        if (worldY < 10) { 
            return 1; // ID Terreno
        }
        if (worldY < 12) {
            return 2; // ID Erba
        }
        return CONFIG.VOXEL_ID_AIR; // Aria
    }
    
    /**
     * Funzione di utility per estrarre la Y locale dal chunkIndex
     * @private
     */
    #getLocalYFromIndex(chunkIndex) {
        // Implementazione inversa della logica di World.getChunkAndVoxelCoords
        return Math.floor(chunkIndex / (CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.REGION_CHUNKS_PER_SIDE_XZ));
    }
}