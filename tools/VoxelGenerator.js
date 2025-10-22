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
        if (size <= 1) { 
            // Questo è il livello di campionamento più fine (materialID 0-254).
            const materialID = this.#getMaterialAtVoxel(rx, ry, rz, chunkIndex, vx, vy, vz);
            
            // Il nodo foglia finale non può essere ulteriormente suddiviso.
            // Il costruttore imposterà lo stato a EMPTY/SOLID.
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
                // Se è una foglia, controlla l'ID del materiale
                if (firstMaterialID === -1) {
                    firstMaterialID = childNode.materialID;
                } else if (firstMaterialID !== childNode.materialID) {
                    isMixed = true; // Diversi ID materiali tra le foglie
                }
            } else {
                isMixed = true; // Se un figlio non è una foglia (è già un nodo MIXED), l'attuale è misto
            }
        }

        // 3. Potatura (Pruning)
        // Se non è misto E abbiamo trovato un materiale uniforme
        if (!isMixed && firstMaterialID !== -1) {
            // Tutti gli 8 figli sono foglie e hanno lo stesso materialID.
            // Ritorna una singola foglia al posto di 8 per massima compressione.
            // Ereditiamo il materiale del volume
            return new OctreeNode(level, firstMaterialID);
        }

        // 4. Nodo Misto (MIXED)
        // Se non potiamo, creiamo un nodo interno. 
        // L'ID del materiale è CONFIG.VOXEL_ID_CUT (255) per indicare al Serializer che è MIXED.
        const parentNode = new OctreeNode(level, CONFIG.VOXEL_ID_CUT); 
        parentNode.children = children;
        return parentNode;
    }

    /**
     * Funzione fittizia per ottenere il Material ID in un punto specifico del Voxel.
     * @private
     */
    #getMaterialAtVoxel(rx, ry, rz, chunkIndex, vx, vy, vz) {
        
        const VSP = CONFIG.VOXEL_SIZE_METERS;
        const MCS_Y = CONFIG.MINI_CHUNK_SIDE_VOXELS;
        const R_C_Y = CONFIG.REGION_CHUNKS_PER_SIDE_Y;

        // Y del Mini-Chunk (indice assoluto):
        const absChunkY = (ry * R_C_Y) + this.#getLocalYFromIndex(chunkIndex); 

        // Y del Voxel (indice assoluto):
        const absVoxelY = (absChunkY * MCS_Y) + vy;

        // Coordinata Y del mondo:
        const worldY = absVoxelY * VSP; // <--- Formula Correta
        
        // DEBUG: CONTROLLA SE IL CHUNK 0 VIENE VISTO CORRETTAMENTE
        if (rx === 0 && ry === 0 && rz === 0 && chunkIndex === 0 && vx === 0 && vz === 0) {
            console.log(`[GENERATOR DEBUG] Chunk 0, Voxel Y=${vy}: WorldY=${worldY.toFixed(2)}m. ID Attribuito: ${worldY < 10 ? 1 : (worldY < 12 ? 2 : 0)}`);
        }

        // Se l'altezza del mondo è sotto un certo livello
        if (worldY < 10) { 
            return 1; // ID Terreno
        }
        if (worldY < 12) {
            return 2; // ID Erba
        }
        return CONFIG.VOXEL_ID_AIR; // Aria (0)
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