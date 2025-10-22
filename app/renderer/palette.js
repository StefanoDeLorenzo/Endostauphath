/**
 * Definizione centrale di tutti i materiali voxel nel mondo.
 * L'ID 255 (VOXEL_ID_CUT) è riservato per i nodi MIXED nell'Octree.
 * * I colori sono in formato RGBA normalizzato (0.0 a 1.0) come array [R, G, B, A] 
 * per la compatibilità con i buffer dei motori 3D (es. Babylon.js).
 */
import CONFIG from '../core/config.js'; 


// Definizione della Palette (array indicizzato per ID)
// L'indice dell'array corrisponde all'ID del materiale.
export const MaterialPalette = [
    // [0] - ARIA (Deve essere sempre il primo)
    { 
        id: CONFIG.VOXEL_ID_AIR, 
        name: "Air", 
        color: [0.0, 0.0, 0.0, 0.0], // Trasparente
        solid: false
    },
    // [1] - TERRENO
    { 
        id: 1, 
        name: "Ground", 
        color: [0.545, 0.271, 0.075, 1.0], // Marrone scuro (0x8B4513)
        solid: true
    },
    // [2] - ERBA
    { 
        id: 2, 
        name: "Grass", 
        color: [0.290, 0.686, 0.314, 1.0], // Verde medio (0x4CAF50)
        solid: true
    },
    // [3] - ROCCIA
    { 
        id: 3, 
        name: "Rock", 
        color: [0.502, 0.502, 0.502, 1.0], // Grigio (0x808080)
        solid: true
    },
    // [4] - ACQUA (Esempio per il futuro)
    { 
        id: 4, 
        name: "Water", 
        color: [0.130, 0.590, 0.950, 0.5], // Azzurro, 50% trasparente (0x2196F3)
        solid: false 
    }
    // Aggiungere altri materiali qui...
];


/**
 * Trova un materiale in base al suo ID.
 * @param {number} id 
 * @returns {object | null}
 */
export function getMaterialById(id) {
    if (id >= 0 && id < MaterialPalette.length) {
        return MaterialPalette[id];
    }
    // Gestisce il caso speciale VOXEL_ID_CUT per debug
    if (id === VOXEL_ID_CUT) {
        // Colore di debug (rosso vivo) per i nodi MIXED
        return { 
            id: VOXEL_ID_CUT, 
            name: "Mixed/Cut", 
            color: [1.0, 0.0, 0.0, 1.0], 
            solid: true 
        };
    }
    console.warn(`Material ID ${id} not found in palette.`);
    return null;
}
