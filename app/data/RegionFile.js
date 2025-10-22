import CONFIG from '../core/config.js'; 

/**
 * Gestisce l'I/O per un singolo File Regione.
 * Responsabilità: Tabella Indici, Dati Raw e Fornire il payload binario (ArrayBuffer)
 * di un Mini-Chunk. NON conosce la struttura Octree. ###
 */
export class RegionFile {
    
    /**
     * @param {number} rx Coordinata X della Regione
     * @param {number} ry Coordinata Y della Regione
     * @param {number} rz Coordinata Z della Regione
     */
    constructor(rName, rx, ry, rz) {
        this.regionID = `R_${rName}_${rx}_${ry}_${rz}`;

        // Nuovi campi per le coordinate e il nome
        this.rName = rName;
        this.rx = rx;
        this.ry = ry;
        this.rz = rz;
        
        // Tabella Indici: Array di 128 record (uno per Mini-Chunk)
        this.indexTable = new Array(CONFIG.REGION_TOTAL_CHUNKS).fill(null);
        this.rawData = null; 
        this.isLoaded = false;

        // Mappa da chunkIndex a ArrayBuffer del chunk serializzato.
        this.chunkDataBuffers = new Map();
        
        // Flag che indica se il file è stato modificato in RAM e necessita di salvataggio
        this.isDirty = false;
    }

    /**
     * Struttura di un record nella Tabella Indici.
     */
    static IndexRecord = class {
        /**
         * @param {number} offset Posizione di inizio del chunk (in byte)
         * @param {number} size Dimensione in byte del chunk serializzato.
         * @param {number} timestamp Ultima modifica.
         */
        constructor(offset, size, timestamp = Date.now()) {
            this.offset = offset;
            this.size = size;
            this.timestamp = timestamp;
        }
    }

    /**
     * Carica i dati binari grezzi (ArrayBuffer) del file regione.
     * @async
     * @param {ArrayBuffer} rawDataBuffer Dati binari letti dal disco locale.
     */
    async loadFile(rawDataBuffer) {
        this.rawData = rawDataBuffer;
        
        if (rawDataBuffer && rawDataBuffer.byteLength > 0) {
            // Analizza la Tabella Indici all'inizio del buffer
            this.parseIndexTable(); 
        } else {
            // File vuoto (tutto Aria), inizializza la tabella come vuota.
            this.indexTable.fill(null);
        }

        this.isLoaded = true;
    }
    
    /**
     * Fornisce i dati binari compressi di un Mini-Chunk specifico.
     * @param {number} chunkIndex Indice 0-127 del Mini-Chunk all'interno della Regione.
     * @returns {ArrayBuffer | null} Il payload binario del chunk.
     */
    getChunkData(chunkIndex) {
        // Accede direttamente al buffer specifico del chunk.
        return this.chunkDataBuffers.get(chunkIndex) || null;
    }
    
    /**
     * Aggiorna i dati binari di un Mini-Chunk in RAM e segna la regione come sporca.
     * @param {number} chunkIndex Indice del chunk.
     * @param {ArrayBuffer} newBuffer Il nuovo buffer serializzato.
     * @param {number} newSize La dimensione in byte.
     */
    updateChunkData(chunkIndex, newBuffer, newSize) {
        // Aggiorna il buffer in RAM
        this.chunkDataBuffers.set(chunkIndex, newBuffer);
        
        // Aggiorna la Tabella Indici (Offset verrà ricalcolato al salvataggio)
        this.indexTable[chunkIndex] = new RegionFile.IndexRecord(0, newSize, Date.now());
        
        this.isDirty = true;
    }

    /**
     * Prepara l'intero ArrayBuffer del file regione da scrivere su disco.
     * Questo metodo ricalcola gli offset e serializza l'Header e i Dati Raw.
     * @returns {ArrayBuffer} L'intero file regione binario pronto per l'I/O.
     */
    serializeFullFile() {
        const headerSize = CONFIG.REGION_TOTAL_CHUNKS * CONFIG.INDEX_RECORD_SIZE_BYTES;
        const totalChunkSize = Array.from(this.chunkDataBuffers.values()).reduce((sum, buffer) => sum + buffer.byteLength, 0);
        const totalFileSize = headerSize + totalChunkSize;

        const finalBuffer = new ArrayBuffer(totalFileSize);
        const dataView = new DataView(finalBuffer);
        const finalUint8Array = new Uint8Array(finalBuffer);
        
        let writeOffset = 0;
        
        // 1. SCRITTURA HEADER (TABELLA INDICI)
        // Calcoliamo gli offset e scriviamo l'header
        let currentChunkOffset = headerSize;
        
        for (let i = 0; i < CONFIG.REGION_TOTAL_CHUNKS; i++) {
            const record = this.indexTable[i];
            
            if (record) {
                // Ricalcola l'offset basandosi sulla posizione corrente
                record.offset = currentChunkOffset; 
                
                // Scrivi il Record nell'Header:
                // Byte 0-3: Offset (Uint32)
                dataView.setUint32(writeOffset, record.offset, true); // true per little-endian
                writeOffset += 4;
                
                // Byte 4-7: Dimensione (Uint32)
                dataView.setUint32(writeOffset, record.size, true);
                writeOffset += 4;
                
                // Byte 8-15: Timestamp (Uint64, fittizio per ora)
                dataView.setBigInt64(writeOffset, BigInt(record.timestamp), true);
                writeOffset += 8;

                // Aggiorna l'offset per il prossimo chunk
                currentChunkOffset += record.size;
            } else {
                // Record vuoto (Chunk Aria/Non Esistente): Scrivi 0 per tutti i campi.
                dataView.setBigInt64(writeOffset, 0n, true); // Offset e Size 0
                dataView.setBigInt64(writeOffset + 8, 0n, true); // Timestamp 0
                writeOffset += 16;
            }
        }
        
        // 2. SCRITTURA DATI CHUNK RAW
        
        // L'offset attuale (writeOffset) dovrebbe essere esattamente uguale a headerSize
        if (writeOffset !== headerSize) {
             console.error("Errore di allineamento dell'Header!");
        }

        for (let i = 0; i < CONFIG.REGION_TOTAL_CHUNKS; i++) {
            const buffer = this.chunkDataBuffers.get(i);
            
            if (buffer) {
                // Copia il buffer del chunk nella posizione corretta del file finale
                finalUint8Array.set(new Uint8Array(buffer), writeOffset);
                writeOffset += buffer.byteLength;
            }
        }
        
        // Aggiorna il riferimento rawData per coerenza dopo il salvataggio
        this.rawData = finalBuffer;
        this.isDirty = false;
        
        return finalBuffer;
    }
    
    /**
     * Logica per analizzare l'intestazione binaria del file esistente
     * e popolare this.indexTable e this.chunkDataBuffers.
     * @private
     */
    parseIndexTable() {
        if (!this.rawData || this.rawData.byteLength === 0) return;

        const dataView = new DataView(this.rawData);
        let readOffset = 0;

        // 1. Leggi l'Header e popola la Tabella Indici
        for (let i = 0; i < CONFIG.REGION_TOTAL_CHUNKS; i++) {
            // Assumi: Record size 16 byte (4 per offset, 4 per size, 8 per timestamp)
            const offset = dataView.getUint32(readOffset, true);
            readOffset += 4;
            
            const size = dataView.getUint32(readOffset, true);
            readOffset += 4;
            
            const timestampBigInt = dataView.getBigInt64(readOffset, true);
            readOffset += 8;

            if (offset > 0 && size > 0) {
                this.indexTable[i] = new RegionFile.IndexRecord(offset, size, Number(timestampBigInt));
            } else {
                this.indexTable[i] = null; // Chunk vuoto
            }
        }

        // 2. Estrai e memorizza i buffer dei chunk in RAM
        for (let i = 0; i < CONFIG.REGION_TOTAL_CHUNKS; i++) {
            const record = this.indexTable[i];
            
            if (record) {
                // Estrae solo la porzione del buffer che contiene il chunk.
                const chunkBuffer = this.rawData.slice(record.offset, record.offset + record.size);
                this.chunkDataBuffers.set(i, chunkBuffer);
            }
        }
    }
}