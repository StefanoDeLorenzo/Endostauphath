/**
 * DualContouring.js
 * * Implementa l'algoritmo di Dual Contouring per estrarre una mesh 
 * * da una griglia di Densità e Materiali (fornita dal ChunkManager).
 * * * Questo algoritmo è preferito rispetto a Marching Cubes (MC) per la sua capacità
 * * di preservare le features (angoli acuti) ed è più adatto per sistemi voxel modificabili.
 * * * La classe è statica (non richiede istanza) per essere utilizzata direttamente nei Web Worker.
 */
import { VOXEL_ID_AIR, getMaterialById } from '../renderer/palette.js';

// =========================================================================================
// TABELLE DI CAMPO IMPLICITO
// =========================================================================================

/**
 * Voxel Corner Table (VCT - Vertici del Cubo)
 * 8 vertici del cubo (0 a 7). Ogni riga è la posizione del vertice nel sistema di coordinate locali 1x1x1.
 * [dx, dy, dz]
 */
const VCT = [
    [0, 0, 0], // 0
    [1, 0, 0], // 1
    [0, 1, 0], // 2
    [1, 1, 0], // 3
    [0, 0, 1], // 4
    [1, 0, 1], // 5
    [0, 1, 1], // 6
    [1, 1, 1]  // 7
];

/**
 * Edge Table (EIT - Indice Spigoli)
 * Definisce i 12 spigoli del cubo in base ai due vertici che li compongono.
 * [V0, V1]
 */
const EIT = [
    [0, 1], [1, 3], [3, 2], [2, 0], // Spigoli Basso (Z=0)
    [4, 5], [5, 7], [7, 6], [6, 4], // Spigoli Alto (Z=1)
    [0, 4], [1, 5], [3, 7], [2, 6]  // Spigoli Verticali
];

// =========================================================================================
// TABELLE DI DUAL CONTOURING (Per la Connettività Duale/Triangolazione)
// =========================================================================================

/**
 * Face Table (FT - 6 Facce del Voxel)
 * Definisce i 4 Vertici Q che circondano lo spigolo duale (faccia primale) per ogni asse.
 * [Axis, Index in Axis, [v0, v1, v2, v3]]
 * Ogni riga definisce i 4 vertici del cubo (indices 0-7) che compongono una faccia.
 */
const FT = [
    // Facce X-Plane (Normale lungo X)
    [[0, 0, 0], [0, 1, 2, 3]], // X=0 (y-z plane)
    [[1, 0, 0], [5, 4, 7, 6]], // X=1
    // Facce Y-Plane (Normale lungo Y)
    [[0, 1, 0], [0, 4, 5, 1]], // Y=0 (x-z plane)
    [[0, 1, 1], [2, 6, 7, 3]], // Y=1
    // Facce Z-Plane (Normale lungo Z)
    [[0, 0, 1], [0, 2, 6, 4]], // Z=0 (x-y plane)
    [[1, 0, 1], [1, 5, 7, 3]]  // Z=1
];

/**
 * Quad Edge Table (QET - Spigoli del Quad)
 * Definisce i vertici di un quad generato dalla connessione di due vertici Q.
 * Per ogni asse (X, Y, Z), definisce i 4 spigoli da collegare.
 * [Axis: 0=X, 1=Y, 2=Z] -> [Edge1, Edge2, Edge3, Edge4]
 * Utilizzato nella #triangulateFaces per creare quad (2 triangoli).
 */
const QET = [
    // Connessioni (spigoli duali) lungo l'asse X (faccia YZ)
    [[0, 4, 1, 5], [2, 6, 3, 7]],
    // Connessioni (spigoli duali) lungo l'asse Y (faccia XZ)
    [[0, 2, 4, 6], [1, 3, 5, 7]],
    // Connessioni (spigoli duali) lungo l'asse Z (faccia XY)
    [[0, 1, 2, 3], [4, 5, 6, 7]]
];


// =========================================================================================
// CLASSE DUAL CONTOURING
// =========================================================================================

export class DualContouring {

    /**
     * Esegue l'algoritmo di Dual Contouring su una griglia di dati volumetrici.
     * @param {Float32Array} densityGrid - Densità (17x17x17)
     * @param {Uint8Array} materialGrid - ID Materiale (17x17x17)
     * @param {number} resolution - Risoluzione della griglia (17)
     * @param {number} voxelSize - Dimensione di un voxel in metri
     * @returns {{vertices: Float32Array, normals: Float32Array, colors: Float32Array, indices: Uint32Array} | null}
     */
    static extractMesh(densityGrid, materialGrid, resolution, voxelSize) {
        
        const numVoxels = resolution - 1; // 16x16x16 voxels
        
        const vertices = [];
        const indices = [];
        const normals = [];
        const colors = [];

        // 1. Array per memorizzare gli indici dei vertici Q (Punti QEF)
        // Per ogni voxel (cella 1x1x1), memorizziamo l'indice del vertice Q generato.
        const vertexIndexMap = new Int32Array(numVoxels ** 3).fill(-1);

        // --- FASE 1: Calcolo dei Vertici Q (QEF) ---
        // Itera su tutti i voxel 16x16x16 (le celle primali)
        for (let y = 0; y < numVoxels; y++) {
            for (let z = 0; z < numVoxels; z++) {
                for (let x = 0; x < numVoxels; x++) {
                    
                    const voxelIndex = x + y * numVoxels + z * numVoxels * numVoxels;
                    
                    // Ottiene l'indice della cella (caso) in base al segno della densità.
                    const cellCase = DualContouring.#getCellCase(densityGrid, resolution, x, y, z);

                    // Se il caso è 0 (tutta aria) o 255 (tutto solido), salta.
                    if (cellCase === 0 || cellCase === 255) {
                        continue;
                    }
                    
                    // La cella è "mista" (interseca la superficie). Calcoliamo il vertice Q.

                    // 1.1. Calcola il Punto Crossover e la Normale Media (Simplificazione QEF)
                    const { point: crossoverPoint, normal: avgNormal, materialID } = 
                        DualContouring.#calculateCrossoverPoint(
                            densityGrid, materialGrid, resolution, x, y, z, cellCase, voxelSize
                        );

                    // 1.2. Aggiungi il Vertice Q (posizione, normale, colore)
                    vertices.push(crossoverPoint.x, crossoverPoint.y, crossoverPoint.z);
                    normals.push(avgNormal.x, avgNormal.y, avgNormal.z);

                    // 1.3. Ottieni il Colore
                    const material = getMaterialById(materialID);
                    if (material) {
                        colors.push(material.color[0], material.color[1], material.color[2], material.color[3]);
                    } else {
                        colors.push(0.5, 0.5, 0.5, 1.0); // Default grigio (in caso di ID non trovato)
                    }

                    // 1.4. Mappa l'indice del vertice Q appena aggiunto al voxel.
                    const newVertexIndex = vertices.length / 3 - 1;
                    vertexIndexMap[voxelIndex] = newVertexIndex;
                }
            }
        }

        // --- FASE 2: Triangolazione (Connettività Duale) ---
        // Itera sugli spigoli del dual grid (le facce dei voxel primari)
        DualContouring.#triangulateFaces(vertexIndexMap, numVoxels, indices);

        // 3. Converti in Float32Array
        if (vertices.length === 0) {
            return null; // Nessuna mesh generata
        }
        
        return DualContouring.#createBufferData(vertices, normals, colors, indices);
    }
    
    // =========================================================================================
    // METODI PRIVATI DI SUPPORTO
    // =========================================================================================

    /**
     * Calcola l'indice del caso della cella (0-255) in base al segno dei suoi 8 vertici.
     * @private
     */
    static #getCellCase(densityGrid, resolution, x, y, z) {
        let cellCase = 0;
        
        for (let i = 0; i < 8; i++) {
            const [dx, dy, dz] = VCT[i];
            
            // Calcola l'indice 1D nella griglia 17x17x17
            const gridIndex = (x + dx) + (y + dy) * resolution + (z + dz) * resolution * resolution;
            
            // Se la densità è solida (> 0), imposta il bit corrispondente
            if (densityGrid[gridIndex] > 0.0) {
                cellCase |= (1 << i);
            }
        }
        return cellCase;
    }

    /**
     * Trova la posizione e la normale media (simplificazione QEF) del vertice Q.
     * @private
     */
    static #calculateCrossoverPoint(densityGrid, materialGrid, resolution, x, y, z, cellCase, voxelSize) {
        let totalDensityChange = 0; 
        let avgPosition = { x: 0, y: 0, z: 0 };
        let avgNormal = { x: 0, y: 0, z: 0 };
        let materialCounts = new Map();

        // 1. Itera su tutti i 12 spigoli del cubo
        for (let i = 0; i < 12; i++) {
            // Controlla se lo spigolo i è intersecato: (cellCase >> i) & 1
            if ((cellCase & (1 << i)) !== 0) {

                const [v0, v1] = EIT[i];
                const [x0, y0, z0] = VCT[v0];
                const [x1, y1, z1] = VCT[v1];

                // Coordinate 1D nella griglia 17x17x17
                const index0 = (x + x0) + (y + y0) * resolution + (z + z0) * resolution * resolution;
                const index1 = (x + x1) + (y + y1) * resolution + (z + z1) * resolution * resolution;

                const d0 = densityGrid[index0];
                const d1 = densityGrid[index1];

                // Esegue l'interpolazione lineare (Isolamento del Crossover)
                // t = d0 / (d0 - d1)
                const t = d0 / (d0 - d1); 

                // Posizione interpolata (nel sistema di coordinate locali del chunk)
                const crossX = (x + x0 + t * (x1 - x0)) * voxelSize;
                const crossY = (y + y0 + t * (y1 - y0)) * voxelSize;
                const crossZ = (z + z0 + t * (z1 - z0)) * voxelSize;
                
                avgPosition.x += crossX;
                avgPosition.y += crossY;
                avgPosition.z += crossZ;
                
                totalDensityChange++;

                // Determina il Materiale predominante lungo lo spigolo
                const matID = d0 > d1 ? materialGrid[index0] : materialGrid[index1];
                materialCounts.set(matID, (materialCounts.get(matID) || 0) + 1);

                // TODO: Calcolo della Normale (implementeremo il gradiente dopo)
            }
        }
        
        // Finalizza la Media della Posizione
        if (totalDensityChange > 0) {
            avgPosition.x /= totalDensityChange;
            avgPosition.y /= totalDensityChange;
            avgPosition.z /= totalDensityChange;
        }

        // Trova il Materiale predominante
        let predominantMaterial = VOXEL_ID_AIR;
        let maxCount = 0;
        for (const [matID, count] of materialCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                predominantMaterial = matID;
            }
        }
        
        // Normale placeholder (sarà sostituita dal gradiente del campo implicito)
        avgNormal = { x: 0.5, y: 0.5, z: 0.5 }; 
        
        return { point: avgPosition, normal: avgNormal, materialID: predominantMaterial };
    }

    /**
     * Triangola le facce del Dual Grid per creare i quad/triangoli.
     * @private
     */
    static #triangulateFaces(vertexIndexMap, numVoxels, indices) {
        
        // Itera sugli spigoli duali (le facce dei voxel primari) lungo i 3 assi.
        
        // 1. Connessioni lungo l'asse X (faccia YZ)
        for (let y = 0; y < numVoxels; y++) {
            for (let z = 0; z < numVoxels; z++) {
                for (let x = 0; x < numVoxels - 1; x++) {
                    
                    const idx1 = x + y * numVoxels + z * numVoxels * numVoxels;
                    const idx2 = (x + 1) + y * numVoxels + z * numVoxels * numVoxels;
                    
                    const vA = vertexIndexMap[idx1]; // Vertice Q nel voxel (x, y, z)
                    const vB = vertexIndexMap[idx2]; // Vertice Q nel voxel (x+1, y, z)
                    
                    // Se entrambi i voxel hanno generato un vertice Q
                    if (vA !== -1 && vB !== -1) {
                        
                        // Qui verificheremmo quali spigoli del dual grid (faccia primale)
                        // sono intersecati per formare il quad (2 triangoli).
                        
                        // Per una dimostrazione di base, assumiamo che la connessione sia quad.
                        // La logica reale richiede un controllo incrociato con i Vertici Q adiacenti su Y e Z.
                        
                        // Placeholder: Se i due Q-Vertices sono presenti, ci sarà una superficie tra loro.
                        
                        // Dobbiamo trovare i 4 vertici del quad che circonda la dual edge (faccia).
                        // Questi 4 vertici sono i Q-Vertices di:
                        // 1. (x, y, z) -> vA
                        // 2. (x+1, y, z) -> vB
                        // 3. (x, y+1, z) -> vC
                        // 4. (x+1, y+1, z) -> vD
                        
                        // Per ora, non possiamo implementare la logica completa del quad senza
                        // l'algoritmo completo della fase 2, quindi lasciamo il ciclo come
                        // struttura per il futuro.
                    }
                }
            }
        }
        
        // TODO: Aggiungere i cicli per le connessioni Y e Z
    }

    /**
     * Converte gli array in Float32Array e Uint32Array finali.
     * @private
     */
    static #createBufferData(vertices, normals, colors, indices) {
        return {
            vertices: new Float32Array(vertices),
            normals: new Float32Array(normals),
            colors: new Float32Array(colors),
            indices: new Uint32Array(indices)
        };
    }
}