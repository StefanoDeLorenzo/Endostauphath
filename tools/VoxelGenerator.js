import { OctreeNode } from '../app/data/OctreeNode.js';
import CONFIG from '../app/core/config.js';

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
        
        // 1. Raggiunto il livello base del voxel (Foglia finale)
        if (size <= 1) { // <--- Questo è il Livello 4
            const materialID = this.#getMaterialAtVoxel(rx, ry, rz, chunkIndex, vx, vy, vz);
            
            // Ritorna sempre una foglia
            return new OctreeNode(level, materialID); 
        }

        // 2. Genera gli 8 figli
        const halfSize = size / 2;
        const children = [];
        let firstMaterialID = -1;
        let isMixed = false;
        
        for (let i = 0; i < 8; i++) {
            const offsetX = (i & 4) ? halfSize : 0;
            const offsetY = (i & 2) ? halfSize : 0;
            const offsetZ = (i & 1) ? halfSize : 0;
            
            const childNode = this.#generateNodeRecursive(
                level + 1, 
                vx + offsetX, vy + offsetY, vz + offsetZ, 
                halfSize, rx, ry, rz, chunkIndex
            );
            
            children.push(childNode); // <--- Aggiungiamo sempre il figlio

            // Controlla se il volume è omogeneo
            if (childNode.isLeaf()) {
                if (firstMaterialID === -1) {
                    firstMaterialID = childNode.materialID;
                } else if (firstMaterialID !== childNode.materialID) {
                    isMixed = true; // Diversi ID materiali tra le foglie
                }
            } else {
                isMixed = true; // Se un figlio è MIXED
            }
        }

        // 3. Potatura (Pruning)
        if (!isMixed && firstMaterialID !== -1) {
            // Ritorna la foglia compressa
            return new OctreeNode(level, firstMaterialID);
        }

        // 4. Nodo Misto (MIXED)
        const parentNode = new OctreeNode(level, CONFIG.VOXEL_ID_CUT); 
        parentNode.children = children; // <--- Assegnazione dei 8 figli
        return parentNode;
    }

    // ... (#getMaterialAtVoxel con la corretta worldY) ...
    #getMaterialAtVoxel(rx, ry, rz, chunkIndex, vx, vy, vz) {
        
        const VSP = CONFIG.VOXEL_SIZE_METERS;
        const MCS_Y = CONFIG.MINI_CHUNK_SIDE_VOXELS;
        const R_C_Y = CONFIG.REGION_CHUNKS_PER_SIDE_Y;

        // Y del Mini-Chunk (indice assoluto):
        const absChunkY = (ry * R_C_Y) + this.#getLocalYFromIndex(chunkIndex); 
        // Y del Voxel (indice assoluto):
        const absVoxelY = (absChunkY * MCS_Y) + vy;

        // Coordinata Y del mondo:
        const worldY = absVoxelY * VSP;
        
        // DEBUG: CONTROLLA SE IL CHUNK 0 VIENE VISTO CORRETTAMENTE
        if (rx === 0 && ry === 0 && rz === 0 && chunkIndex === 0 && vx === 0 && vz === 0) {
            console.log(`[GENERATOR DEBUG] Chunk 0, Voxel Y=${vy}: WorldY=${worldY.toFixed(2)}m. ID Attribuito: ${worldY < 10 ? 1 : (worldY < 12 ? 2 : 0)}`);
        }
        
        // Logica di campionamento
        if (worldY < 10) { 
            return 1; // ID Terreno
        }
        if (worldY < 12) {
            return 2; // ID Erba
        }
        return CONFIG.VOXEL_ID_AIR; // Aria (0)
    }
    
    // ... (#getLocalYFromIndex) ...
    #getLocalYFromIndex(chunkIndex) {
        return Math.floor(chunkIndex / (CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.REGION_CHUNKS_PER_SIDE_XZ));
    }
}
