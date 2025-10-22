import CONFIG from '../core/config.js';

/**
 * Definisce le funzioni di campo implicito che descrivono la superficie del mondo.
 * Questa classe è usata dal Marching Cubes (per la geometria) 
 * e dal VoxelGenerator (per la struttura Octree iniziale).
 */
export class ImplicitField {

    /**
     * Ottiene la Densità e l'ID Materiale in qualsiasi coordinata mondo (X, Y, Z).
     * @param {number} worldX 
     * @param {number} worldY 
     * @param {number} worldZ 
     * @returns {{density: number, materialID: number}} 
     */
    static getVoxelDataAtWorldCoords(worldX, worldY, worldZ) {
        let density;
        let materialID;

        // --- Logica attuale: Piano orizzontale liscio (superficie a Y=11.0m) ---

        if (worldY < 10) {
            // Sotto i 10 metri: Solido pieno
            density = 1.0;
            materialID = CONFIG.VOXEL_ID_GROUND; // ID 1 (Terra)
        } else if (worldY < 12) {
            // Tra 10 e 12 metri: Transizione (sfumatura da 1.0 a 0.0)
            density = (12.0 - worldY) / 2.0; 
            materialID = CONFIG.VOXEL_ID_GRASS; // ID 2 (Erba)
        } else {
            // Sopra i 12 metri: Aria pura
            density = 0.0;
            materialID = CONFIG.VOXEL_ID_AIR; // ID 0 (Aria)
        }
        
        density = Math.max(0.0, Math.min(1.0, density));

        return { density, materialID };
    }
    
    /**
     * Determina solo l'ID materiale (0-254) in base alla posizione Y.
     * Usato dal VoxelGenerator per creare l'Octree.
     * @param {number} worldY 
     * @returns {number} ID Materiale
     */
    static getMaterialIDAtWorldCoords(worldY) {
        // Usa la stessa logica del campo, ma restituisce solo l'ID.
        const data = ImplicitField.getVoxelDataAtWorldCoords(0, worldY, 0); // X e Z non influenzano
        return data.materialID;
    }
}