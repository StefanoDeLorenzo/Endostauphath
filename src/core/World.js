import CONFIG from './config.js'; 
import { RegionFile } from '../data/RegionFile.js'; 
import { OctreeSerializer } from '../data/OctreeSerializer.js'; 

/**
 * Gestore globale del mondo (World Manager).
 * Responsabilità:
 * 1. Mantenere la cache degli oggetti RegionFile attivi.
 * 2. Gestire il caricamento/scaricamento (LOD/Streaming).
 * 3. Fornire accesso ai Mini-Chunk, coordinando RegionFile e OctreeSerializer.
 */
export class World {
    
    // Mappa che memorizza gli oggetti RegionFile caricati.
    // Chiave: stringa univoca (es. "Overworld_0_0_0")
    // Valore: istanza di RegionFile
    #regionCache = new Map();

    constructor() {
        console.log(`World Manager avviato. Dimensione predefinita: ${CONFIG.DEFAULT_REGION_NAME}`);
    }

    /**
     * Genera una chiave univoca per la cache globale delle Regioni.
     * @param {string} rName Nome della Dimensione/Mondo.
     * @param {number} rx Coordinata X della Regione.
     * @param {number} ry Coordinata Y della Regione.
     * @param {number} rz Coordinata Z della Regione.
     * @returns {string} Chiave della cache (es. "Overworld_0_0_0")
     */
    getRegionKey(rName, rx, ry, rz) {
        return `${rName}_${rx}_${ry}_${rz}`;
    }

    /**
     * Ottiene o carica un RegionFile dalla cache, inclusa la sua Tabella Indici.
     * @async
     * @returns {RegionFile}
     */
    async getRegionFile(rName, rx, ry, rz) {
        const key = this.getRegionKey(rName, rx, ry, rz);
        
        if (this.#regionCache.has(key)) {
            return this.#regionCache.get(key);
        }
        
        // Creiamo la nuova istanza
        const newRegionFile = new RegionFile(rName, rx, ry, rz);
        
        // Carichiamo i dati binari (Tabella Indici e Raw Data)
        // Assumiamo che il percorso del file segua il regionID: data/regions/R_rName_rx_ry_rz.rgn
        const regionUrl = `data/regions/R_${key}.rgn`;
        
        await newRegionFile.loadFile(regionUrl);
        
        this.#regionCache.set(key, newRegionFile);
        return newRegionFile;
    }
    
    // =================================================================
    // ACCESSO AI CHUNK (Flusso di Dati Completo)
    // =================================================================

    /**
     * Ottiene, carica, e deserializza un Mini-Chunk (OctreeNode) specifico.
     * * Riguardo al refactoring: Questo è il metodo che, in una versione definitiva, 
     * potresti delegare a un "ChunkLoader" o a VoxelAccessor.
     * * @async
     * @param {string} rName Nome della Dimensione.
     * @param {number} rx Coordinate della Regione (X).
     * @param {number} ry Coordinate della Regione (Y).
     * @param {number} rz Coordinate della Regione (Z).
     * @param {number} chunkIndex Indice 0-127 del Mini-Chunk all'interno della Regione.
     * @returns {OctreeNode | null} La radice dell'Octree.
     */
    async getMiniChunkRoot(rName, rx, ry, rz, chunkIndex) {
        // 1. Ottiene il RegionFile (Cache Hit o Caricamento I/O)
        const regionFile = await this.getRegionFile(rName, rx, ry, rz);
        
        if (!regionFile || !regionFile.isLoaded) return null;

        // 2. Ottiene il payload binario (ArrayBuffer slice)
        const chunkDataBuffer = regionFile.getChunkData(chunkIndex);

        if (chunkDataBuffer === null) {
            // Caso in cui la Tabella Indici dice che il chunk non esiste (es. tutto Aria)
            // o è stato compresso a zero byte.
            return null; 
        }

        // 3. Deserializza: Trasforma i byte binari nell'oggetto OctreeNode
        const octreeRoot = OctreeSerializer.deserialize(chunkDataBuffer);
        
        return octreeRoot;
    }
    
    // =================================================================
    // GESTIONE DELLA MEMORIA (Cleaning/Garbage Collection)
    // =================================================================
    
    /**
     * Scarica (Unload) le Regioni che sono troppo lontane dalla posizione del giocatore
     * per liberare RAM.
     * @param {number} currentRx La coordinata Regione X del giocatore.
     * @param {number} currentRy La coordinata Regione Y del giocatore.
     * @param {number} currentRz La coordinata Regione Z del giocatore.
     */
    purgeCache(currentRx, currentRy, currentRz) {
        // Esempio: limite di distanza 3 regioni
        const maxDistance = CONFIG.MAX_STREAMING_DISTANCE_REGIONS;
        
        for (const [key, regionFile] of this.#regionCache.entries()) {
            
            // Calcolo approssimativo della distanza
            const distSq = (regionFile.rx - currentRx)**2 + 
                           (regionFile.ry - currentRy)**2 + 
                           (regionFile.rz - currentRz)**2;
            
            if (distSq > maxDistance**2) {
                // Logica di scaricamento:
                // 1. Se modificato, serializza e salva il file sul disco/server (I/O Write)
                // 2. Rimuovi dalla cache
                this.#regionCache.delete(key);
                console.log(`Scarico RegionFile: ${regionFile.regionID}`);
            }
        }
    }
}