/**
 * CONFIGURAZIONE GLOBALE DEL MOTORE VOXEL (Octree/Dual Contouring)
 * Tutti i valori derivati sono calcolati a partire dalle costanti base.
 */
 
// ====================================================================
// 1. DEFINIZIONE DEI PARAMETRI BASE 📐💾👁️
// ====================================================================
const BASE_CONFIG = {
    // SCALA E RISOLUZIONE DEL MONDO
    VOXEL_SIZE_METERS: 1.5, 
    MINI_CHUNK_SIDE_VOXELS: 16, 
    EXTRA_DETAIL_LEVELS: 5, 
    
    // STRUTTURA DEL FILE REGIONE (I/O)
    INDEX_RECORD_SIZE_BYTES: 16, 
    REGION_MAX_FILE_SIZE_MB: 2.0, 
    REGION_CHUNKS_PER_SIDE_XZ: 8,
    REGION_CHUNKS_PER_SIDE_Y: 2,
    
    // LOD E DISTANZE VISIVE
    LOD_DISTANCE_CHUNKS: {
        NEAR: 3, 
        MEDIUM: 8,
        FAR: 16 
    },
    
    // PARAMETRI DATI E ALGORITMI
    VOXEL_ID_AIR: 0,
    VOXEL_ID_CUT: 255,
    ISO_SURFACE_THRESHOLD: 0.5,
};

// ====================================================================
// 2. CALCOLO DEI PARAMETRI DERIVATI ⚙️
// Viene creato il CONFIG finale unendo BASE_CONFIG e i calcoli.
// ====================================================================
const DERIVED_CONFIG = {
    // Profondità Massima Totale dell'Octree: 4 (base) + 5 (dettaglio)
    OCTREE_MAX_DEPTH: 
        Math.log2(BASE_CONFIG.MINI_CHUNK_SIDE_VOXELS) + // Usato 16 invece di BASE_CONFIG.MINI_CHUNK_SIDE_VOXELS
        BASE_CONFIG.EXTRA_DETAIL_LEVELS, // 9

    // Dimensione fisica in metri di un Mini-Chunk (16 * 1.5 = 24m)
    MINI_CHUNK_SIZE_METERS: 
        BASE_CONFIG.MINI_CHUNK_SIDE_VOXELS * BASE_CONFIG.VOXEL_SIZE_METERS, // 24.0 metri

    // Totale Mini-Chunk per File Regione (8 * 8 * 2 = 128)
    REGION_TOTAL_CHUNKS: 
        BASE_CONFIG.REGION_CHUNKS_PER_SIDE_XZ * BASE_CONFIG.REGION_CHUNKS_PER_SIDE_XZ * BASE_CONFIG.REGION_CHUNKS_PER_SIDE_Y, // 128
    
    // Dimensione fisica del File Regione (192m x 48m x 192m)
    REGION_SIZE_METERS: {
        X: BASE_CONFIG.REGION_CHUNKS_PER_SIDE_XZ * BASE_CONFIG.MINI_CHUNK_SIZE_METERS, // 192 metri
        Y: BASE_CONFIG.REGION_CHUNKS_PER_SIDE_Y * BASE_CONFIG.MINI_CHUNK_SIZE_METERS, // 48 metri
        Z: BASE_CONFIG.REGION_CHUNKS_PER_SIDE_XZ * BASE_CONFIG.MINI_CHUNK_SIZE_METERS // 192 metri
    },
};

// ====================================================================
// 3. ESPORTAZIONE FINALE
// Unisce i due oggetti in uno solo per facilità d'uso.
// ====================================================================
const CONFIG = {
    ...BASE_CONFIG,
    ...DERIVED_CONFIG,
};

export default CONFIG;