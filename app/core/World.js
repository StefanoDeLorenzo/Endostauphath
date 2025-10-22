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
    #directoryHandle = null;
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
     * Apre la finestra di dialogo per permettere all'utente di selezionare la directory di gioco.
     * Deve essere chiamato prima di tentare il caricamento dei file regione.
     * @async
     * @returns {boolean} True se la selezione è riuscita e il permesso è stato dato.
     */
    async selectGameDirectory() {
        if (!('showDirectoryPicker' in window)) {
            console.error("Browser non supportato: File System Access API assente.");
            return false;
        }

        try {
            // Richiede all'utente di selezionare una directory
            const handle = await window.showDirectoryPicker();
            this.#directoryHandle = handle;
            
            // Verifica i permessi di lettura/scrittura (necessari per il salvataggio!)
            const permission = await handle.queryPermission({ mode: 'readwrite' });

            if (permission !== 'granted') {
                // Riprova a richiedere i permessi se l'utente non li ha concessi
                await handle.requestPermission({ mode: 'readwrite' });
            }

            console.log(`Directory di gioco selezionata: ${handle.name}`);
            return true;

        } catch (error) {
            console.error("Selezione directory annullata o fallita:", error);
            this.#directoryHandle = null;
            return false;
        }
    }

    /**
     * Ottiene o carica un RegionFile dalla cache, inclusa la sua Tabella Indici.
     * @async
     * @returns {RegionFile}
     */
    async getRegionFile(rName, rx, ry, rz) {
        if (!this.#directoryHandle) {
            throw new Error("Directory di gioco non selezionata. Chiamare selectGameDirectory per prima.");
        }

        const key = this.getRegionKey(rName, rx, ry, rz);
        
        if (this.#regionCache.has(key)) {
            return this.#regionCache.get(key);
        }
        
        const newRegionFile = new RegionFile(rName, rx, ry, rz);
        const regionFileName = `R_${key}.rgn`;

        try {
            // 1. Cerca il file all'interno della sottocartella /regions/
            const regionsDir = await this.#directoryHandle.getDirectoryHandle('regions', { create: false });
            const fileHandle = await regionsDir.getFileHandle(regionFileName);
            const file = await fileHandle.getFile();
            
            // 2. Leggi il contenuto come ArrayBuffer (I/O Locale!)
            const rawDataBuffer = await file.arrayBuffer();

            // Carichiamo i dati raw e la Tabella Indici (assumendo che RegionFile.loadFile sia aggiornato)
            await newRegionFile.loadFile(rawDataBuffer); // Ora prende il buffer, non l'URL
            
            this.#regionCache.set(key, newRegionFile);
            console.log(`Caricato RegionFile locale: ${regionFileName}`);
            return newRegionFile;

        } catch (error) {
             // Il file o la directory non esiste. Restituisce un RegionFile vuoto (Aria)
            console.warn(`File regione non trovato o inaccessibile: ${regionFileName}. Generazione necessaria.`);
            this.#regionCache.set(key, newRegionFile);
            return newRegionFile;
        }
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
    
    // =================================================================
    // GESTIONE DELLA SCRITTURA E DEL SALVATAGGIO
    // =================================================================

    /**
     * Esegue il salvataggio fisico dell'intero RegionFile sul disco locale.
     * Questo è il metodo che il gioco chiama quando un chunk viene modificato 
     * o durante un salvataggio generale.
     * @async
     * @param {RegionFile} regionFile L'istanza RegionFile da salvare.
     */
    async saveRegionFileToDisk(regionFile) {
        if (!this.#directoryHandle) {
            throw new Error("Directory di gioco non selezionata. Impossibile salvare.");
        }

        try {
            const regionFileName = `R_${regionFile.rName}_${regionFile.rx}_${regionFile.ry}_${regionFile.rz}.rgn`;
            
            // 1. Ottiene l'handle alla sottocartella /regions/ (crea se non esiste)
            const regionsDir = await this.#directoryHandle.getDirectoryHandle('regions', { create: true });
            
            // 2. Ottiene l'handle al file specifico (crea se non esiste)
            const fileHandle = await regionsDir.getFileHandle(regionFileName, { create: true });
            
            // 3. Ottiene un writer per il file
            const writableStream = await fileHandle.createWritable();
            
            // 4. Delega a RegionFile la preparazione del buffer completo
            const fullFileBuffer = regionFile.serializeFullFile(); // NUOVO METODO

            // 5. Scrive il buffer completo sul disco e chiude lo stream
            await writableStream.write(fullFileBuffer);
            await writableStream.close();

            console.log(`RegionFile salvato con successo: ${regionFileName} (${fullFileBuffer.byteLength} byte)`);

        } catch (error) {
            console.error(`ERRORE DI SALVATAGGIO File System API per ${regionFile.regionID}:`, error);
        }
    }

    /**
     * Aggiorna un Mini-Chunk modificato e ne segna lo stato come "sporco" (dirty)
     * per un salvataggio successivo.
     * @param {string} rName, rx, ry, rz Coordinate complete del Chunk
     * @param {number} chunkIndex Indice locale del Mini-Chunk (0-127)
     * @param {ArrayBuffer} serializedChunkBuffer Dati binari del nuovo chunk.
     * @param {number} newChunkSize La dimensione del buffer in byte.
     */
    async updateAndMarkChunk(rName, rx, ry, rz, chunkIndex, serializedChunkBuffer, newChunkSize) {
        const regionFile = await this.getRegionFile(rName, rx, ry, rz);
        
        // 1. Aggiorna i dati nel RegionFile (in RAM)
        regionFile.updateChunkData(chunkIndex, serializedChunkBuffer, newChunkSize); // NUOVO METODO
        
        // 2. Segna la regione come modificata
        regionFile.isDirty = true;

        // In un vero motore, si salverebbe periodicamente. Per ora, simuliamo il salvataggio immediato.
        // await this.saveRegionFileToDisk(regionFile);
    }
}