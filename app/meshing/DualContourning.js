/**
 * DualContouring.js
 * * Implementa l'algoritmo di Dual Contouring per estrarre una mesh 
 * * da una griglia di Densità e Materiali (fornita dal ChunkManager).
 * * * Questo algoritmo è preferito rispetto a Marching Cubes (MC) per la sua capacità
 * * di preservare le features (angoli acuti) ed è più adatto per sistemi voxel modificabili.
 * * * La classe è statica (non richiede istanza) per essere utilizzata direttamente nei Web Worker.
 */
import { VOXEL_ID_AIR, getMaterialById } from '../core/palette.js';

// =========================================================================================
// TABELLE DI CAMPO IMPLICITO
// Queste tabelle definiscono la connettività di base, simili a quelle del Marching Cubes.
// =========================================================================================

/**
 * Voxel Corner Table (Cube Vertices)
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
 * Edge Table (Edge Index)
 * Definisce i 12 spigoli del cubo in base ai due vertici che li compongono.
 * [V0, V1]
 */
const EIT = [
    [0, 1], [1, 3], [3, 2], [2, 0], // Bottom Face Edges (Z=0)
    [4, 5], [5, 7], [7, 6], [6, 4], // Top Face Edges (Z=1)
    [0, 4], [1, 5], [3, 7], [2, 6]  // Vertical Edges
];

/**
 * Triangle Table (Triangulation Table)
 * Simile alla TriTable di Marching Cubes, definisce i triangoli per ogni caso (256 casi).
 * Usata per definire le facce intersecate.
 * * NOTA: Per Dual Contouring è sufficiente sapere quali SPIGOLI sono intersecati (Edge Table)
 * e quali CELLE sono "cut" (Cell Case). Questa tabella è semplificata rispetto a MC.
 * Per DC puro, spesso si usano solo i casi per determinare la connettività dei vertici Q.
 */
// La TriTable completa è troppo grande. Usiamo una placeholder e ci concentriamo sulla logica G-Field.
// Qui useremo una versione molto semplificata, focalizzata sulle 6 facce del Dual Grid.
// L'indice 0-255 indica quali 1-3 spigoli sono intersecati per formare i triangoli.
const TriTable = [
    // La tabella completa ha 256 elementi. Ne mostriamo alcuni rappresentativi.
    // L'implementazione completa richiede un algoritmo che definisce la connettività
    // dei vertici Q (QEF) e l'indice delle facce.
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
        // Itera su tutti i voxel 16x16x16
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

                    // 1.1. Calcola il Punto Crossover e la Normale Media
                    // Usiamo la Media Ponderata dell'intersezione (per semplificare il QEF)
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
                        colors.push(0, 0, 0, 1); // Default nero
                    }

                    // 1.4. Mappa l'indice del vertice Q appena aggiunto al voxel.
                    const newVertexIndex = vertices.length / 3 - 1;
                    vertexIndexMap[voxelIndex] = newVertexIndex;
                }
            }
        }

        // --- FASE 2: Triangolazione (Connettività) ---
        // Itera sugli spigoli del dual grid (le facce dei voxel primari)
        DualContouring.#triangulateFaces(vertexIndexMap, numVoxels, indices);

        // 3. Converti in Float32Array
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
        
        // Itera sugli 8 vertici del cubo (0-7)
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
        let totalDensityChange = 0; // Per la media ponderata
        let avgPosition = { x: 0, y: 0, z: 0 };
        let avgNormal = { x: 0, y: 0, z: 0 };
        let materialCounts = new Map();

        // 1. Itera su tutti i 12 spigoli del cubo
        for (let i = 0; i < 12; i++) {
            // Controlla se lo spigolo i è intersecato
            if (cellCase & (1 << i)) { // Solo gli spigoli intersecati sono nella Edge Table

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

                // Aggiungiamo il punto interpolato e la normale media
                const crossX = (x + x0 + t * (x1 - x0)) * voxelSize;
                const crossY = (y + y0 + t * (y1 - y0)) * voxelSize;
                const crossZ = (z + z0 + t * (z1 - z0)) * voxelSize;
                
                // Per una corretta DC, qui si dovrebbe usare la QEF (Quadric Error Function)
                // per trovare il vertice ottimale. Per semplicità, usiamo la media.
                avgPosition.x += crossX;
                avgPosition.y += crossY;
                avgPosition.z += crossZ;
                
                totalDensityChange++; // Conta i punti da mediare

                // Determina il Materiale predominante lungo lo spigolo
                const matID = d0 > d1 ? materialGrid[index0] : materialGrid[index1];
                materialCounts.set(matID, (materialCounts.get(matID) || 0) + 1);

                // TODO: Calcolo della Normale al Crossover
                // Per un calcolo preciso si dovrebbe usare il gradiente del campo implicito.
                // Per ora, useremo una normale fissa o calcolata in modo rozzo.
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
        
        // Normale fittizia per ora (sarà corretta con l'implementazione del Gradiente)
        avgNormal = { x: 0.5, y: 0.5, z: 0.5 }; // Placeholder
        
        return { point: avgPosition, normal: avgNormal, materialID: predominantMaterial };
    }

    /**
     * Triangola le facce del Dual Grid per creare i quad/triangoli.
     * @private
     */
    static #triangulateFaces(vertexIndexMap, numVoxels, indices) {
        
        // Itera sui voxel (celle primarie) e sugli spigoli della griglia duale.
        // Un vertice Q è connesso ai vertici Q dei voxel adiacenti se condividono uno spigolo
        // (il vertice Q duale) che interseca la superficie.
        
        // Qui la logica DC è complessa (dipende dalla connettività degli spigoli)
        // Per ora, iteriamo sugli spigoli e se due voxel adiacenti hanno un vertice Q,
        // creiamo una faccia di connessione (un quad).
        
        // TODO: Implementare il ciclo completo della triangolazione duale (6 facce)
        
        // Ciclo di prova (solo per la connessione X)
        for (let y = 0; y < numVoxels; y++) {
            for (let z = 0; z < numVoxels; z++) {
                for (let x = 0; x < numVoxels - 1; x++) {
                    
                    const idx1 = x + y * numVoxels + z * numVoxels * numVoxels;
                    const idx2 = (x + 1) + y * numVoxels + z * numVoxels * numVoxels;
                    
                    const v1 = vertexIndexMap[idx1];
                    const v2 = vertexIndexMap[idx2];
                    
                    // Se entrambi i voxel hanno generato un vertice Q, possono essere connessi
                    if (v1 !== -1 && v2 !== -1) {
                        // Questo non è corretto per la triangolazione DC, ma serve come placeholder.
                        // La vera DC genera quad basati sulla connettività delle facce.
                        // console.log(`Connecting Q-Vertices ${v1} and ${v2}`); 
                    }
                }
            }
        }
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