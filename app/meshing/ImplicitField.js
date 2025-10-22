/**
 * ImplicitField.js
 * * Classe responsabile per il calcolo on-the-fly della Densità (per la geometria) 
 * e del Materiale (per il colore) in qualsiasi punto del mondo (x, y, z).
 * * La densità è calcolata tramite il Perlin Noise per simulare un terreno naturale
 * (montagne, colline, ecc.). Questo dato NON è memorizzato nell'Octree.
 */
// Importa VOXEL_ID_AIR dalla palette centralizzata, come concordato.
import { VOXEL_ID_AIR } from '../renderer/palette.js'; 

// === CONSTANTS ===
const NOISE_SCALE = 1 / 100; // Scala del rumore: 1 unità = 100 metri
const MAX_HEIGHT = 20.0;    // Variazione massima di altezza dal BASE_HEIGHT
// ====================================

// === SIMULAZIONE LIBRERIA NOISE ===
/**
 * Funzione di rumore 3D simulata (da sostituire con una vera libreria Perlin/Simplex Noise).
 * Produce un valore float tra 0.0 e 1.0.
 */
class NoiseGenerator {
    static perlin3D(x, y, z) {
        // Usa una combinazione di seno e coseno per simulare le increspature del terreno.
        // Questo è solo un placeholder matematico.
        return Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.5 + 0.5; 
    }
}
// ====================================


export class ImplicitField {
    constructor() {
        // La soglia di densità usata dal Marching Cubes (SDF: 0 è la superficie)
        this.ISOVALUE = 0.0; 
        
        // Altezza minima del terreno sopra Y=0
        this.BASE_HEIGHT = 10.0; 
    }

    /**
     * Determina la densità e il materiale in un punto del mondo.
     * * @param {number} x Coordinata mondiale X (metri)
     * @param {number} y Coordinata mondiale Y (metri)
     * @param {number} z Coordinata mondiale Z (metri)
     * @returns {{density: number, materialID: number}} density < 0 = Solido, density > 0 = Aria
     */
    getVoxelDataAtWorldCoords(x, y, z) {
        
        // 1. Calcola l'altezza del terreno (Heightmap)
        const noiseX = x * NOISE_SCALE;
        const noiseZ = z * NOISE_SCALE;

        const noiseValue = NoiseGenerator.perlin3D(noiseX, 0, noiseZ);
        
        const terrainHeight = this.BASE_HEIGHT + (noiseValue * MAX_HEIGHT); 

        // 2. Determina la Densità (Signed Distance Field)
        // Negativo = Solido; Positivo = Aria. La superficie è a density = 0.
        const density = y - terrainHeight;

        // 3. Determina il Materiale
        let materialID = VOXEL_ID_AIR; // Usa la costante importata

        // Se siamo sotto la superficie (density <= ISOVALUE)
        if (density <= this.ISOVALUE) {
            
            // Logica di Stratificazione del Materiale 
            // Invertiamo il segno della densità per ottenere la profondità sotto la superficie
            const depthBelowSurface = -density; 

            if (depthBelowSurface <= 1.0) { 
                materialID = 2; // Erba (ID 2: Surface)
            } else if (depthBelowSurface <= 5.0) { 
                materialID = 1; // Terreno (ID 1: Dirt)
            } else { 
                materialID = 3; // Roccia (ID 3: Rock - Deep)
            }
        }

        return { 
            density: density, 
            materialID: materialID 
        };
    }

    /**
     * Metodo di campionamento semplificato per l'Octree Builder (VoxelGenerator)
     * @param {number} x 
     * @param {number} y 
     * @param {number} z 
     * @returns {number} Material ID (0=Aria, >0=Solido)
     */
    getMaterialIdForOctree(x, y, z) {
        return this.getVoxelDataAtWorldCoords(x, y, z).materialID;
    }
}
