/**
 * CONFIGURAZIONE GLOBALE DEL MOTORE VOXEL (Octree/Dual Contouring)
 * Tutti i valori derivati sono calcolati a partire dalle costanti base.
 */
const CONFIG = {
    
    // ====================================================================
    // 1. SCALA E RISOLUZIONE DEL MONDO 📐
    // ====================================================================
    
    VOXEL_SIZE_METERS: 1.5,                 // Dimensione fisica di 1 Voxel Base
    MINI_CHUNK_SIDE_VOXELS: 16,             // Voxel per lato di 1 Mini-Chunk (16x16x16)
    EXTRA_DETAIL_LEVELS: 5,                 // Livelli di suddivisione extra (per dettaglio fine)
    
    // ====================================================================
    // 2. STRUTTURA DEL FILE REGIONE (I/O) 💾
    // ====================================================================
    
    REGION_MAX_FILE_SIZE_MB: 2.0,           // Limite I/O (2 MB)
    
    // Cardinalità di Mini-Chunk in una Regione (X e Z)
    REGION_CHUNKS_PER_SIDE_XZ: 8,
    // Cardinalità di Mini-Chunk in Altezza (Y)
    REGION_CHUNKS_PER_SIDE_Y: 2,
    
    // ====================================================================
    // 3. LOD E DISTANZE VISIVE 👁️
    // ====================================================================
    
    LOD_DISTANCE_CHUNKS: {
        NEAR: 3,    // Dettaglio completo (Livello 9)
        MEDIUM: 8,  // Dettaglio medio (Livello 7-8)
        FAR: 16     // Basso dettaglio (Livello 4-6, LOD massimo)
    },
    
    // ====================================================================
    // 4. PARAMETRI DERIVATI (CALCOLATI) ⚙️
    // ====================================================================
    
    // Profondità Massima Totale dell'Octree: 4 (base) + 5 (dettaglio)
    OCTREE_MAX_DEPTH: 
        Math.log2(16) + 
        CONFIG.EXTRA_DETAIL_LEVELS, // 9

    // Dimensione fisica in metri di un Mini-Chunk (16 * 1.5 = 24m)
    MINI_CHUNK_SIZE_METERS: 
        CONFIG.MINI_CHUNK_SIDE_VOXELS * CONFIG.VOXEL_SIZE_METERS, // 24.0 metri

    // Totale Mini-Chunk per File Regione (8 * 8 * 2 = 128)
    REGION_TOTAL_CHUNKS: 
        CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.REGION_CHUNKS_PER_SIDE_Y, // 128
    
    // Dimensione fisica del File Regione (192m x 48m x 192m)
    REGION_SIZE_METERS: {
        X: CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.MINI_CHUNK_SIZE_METERS, // 192 metri
        Y: CONFIG.REGION_CHUNKS_PER_SIDE_Y * CONFIG.MINI_CHUNK_SIZE_METERS,  // 48 metri
        Z: CONFIG.REGION_CHUNKS_PER_SIDE_XZ * CONFIG.MINI_CHUNK_SIZE_METERS  // 192 metri
    },

    // ====================================================================
    // 5. PARAMETRI DATI E ALGORITMI
    // ====================================================================

    VOXEL_ID_AIR: 0, 
    ISO_SURFACE_THRESHOLD: 0.5,
};

export default CONFIG;