/**
 * Threading.js
 * * Classe per la gestione di un pool di Web Workers (Thread) pronti e riutilizzabili.
 * * Presuppone che tutti i worker eseguano lo stesso script (es. mesherWorker.js).
 * * Utilizza una logica round-robin per distribuire i compiti.
 */

// Importiamo la configurazione per i valori di fallback
import CONFIG from '../core/config.js'; 

export class Threading {
    
    /**
     * Mappa per tenere traccia dei worker avviati per un compito specifico.
     * Chiave: Stringa ID del compito (es. 'chunk-1_2_3').
     * Valore: Oggetto Worker.
     * @type {Map<string, Worker>}
     */
    #activeWorkerMap = new Map();

    /**
     * Array contenente il pool di worker pronti e riutilizzabili.
     * @type {Worker[]}
     */
    #workerPool = [];

    /**
     * Indice per la distribuzione circolare dei compiti (round-robin).
     * @type {number}
     */
    #nextWorkerIndex = 0;

    /**
     * @param {string} workerScriptPath - Percorso del file worker da eseguire (es: './mesherWorker.js').
     * @param {number} poolSize - Dimensione desiderata del pool. Se 0 o non specificato, usa CONFIG.
     */
    constructor(workerScriptPath, poolSize = 0) {
        this.workerScriptPath = workerScriptPath;
        
        // Determina la dimensione del pool (usa CONFIG come fallback)
        const size = poolSize > 0 ? poolSize : (CONFIG.THREAD_POOL_SIZE || 4);
        
        this.#initializeWorkerPool(size);
        
        console.log(`[Threading] Pool inizializzato: ${size} worker riutilizzabili pronti.`);
    }

    /**
     * Crea e inizializza il pool di worker con lo script fornito.
     * @param {number} size - Dimensione del pool.
     * @private
     */
    #initializeWorkerPool(size) {
        for (let i = 0; i < size; i++) {
            // Un worker è legato al suo script per tutta la sua vita utile.
            const worker = new Worker(this.workerScriptPath, { name: `VoxelWorker-${i}` });
            
            // Imposta un gestore di errore di base
            worker.onerror = (e) => {
                console.error(`[Worker ${worker.name}] Errore:`, e);
                // Non tentiamo di rilanciare qui, ma registriamo l'errore.
            };

            this.#workerPool.push(worker);
        }
    }

    /**
     * Assegna un compito al prossimo worker disponibile nel pool in modo circolare (round-robin).
     * Il worker è riutilizzato per compiti successivi.
     * @param {string} taskId - ID univoco per il compito (es. 'chunk-1_2_3').
     * @param {object} message - I dati da inviare al worker.
     * @param {Transferable[]} [transferList] - Array di oggetti trasferibili (per Transferable Objects).
     */
    runTask(taskId, message, transferList = []) {
        if (this.#workerPool.length === 0) {
            console.warn("[Threading] Pool worker vuoto. Impossibile eseguire il compito.");
            return;
        }
        
        if (this.#activeWorkerMap.has(taskId)) {
             console.warn(`[Threading] Compito ${taskId} è già attivo.`);
             return;
        }

        // Round-robin: seleziona il prossimo worker riutilizzabile
        const worker = this.#workerPool[this.#nextWorkerIndex];
        this.#nextWorkerIndex = (this.#nextWorkerIndex + 1) % this.#workerPool.length;

        // Mappa il worker al Task ID
        this.#activeWorkerMap.set(taskId, worker);

        // Invia il messaggio al worker.
        worker.postMessage({ taskId, ...message }, transferList);
    }

    /**
     * Termina l'associazione tra un compito e un worker.
     * Utile quando si riceve una risposta dal worker per pulire la mappa dei compiti attivi.
     * Il worker rimane nel pool per essere riutilizzato.
     * @param {string} taskId - L'ID del compito da terminare.
     * @private
     */
    #releaseTask(taskId) {
        if (this.#activeWorkerMap.has(taskId)) {
            this.#activeWorkerMap.delete(taskId);
            // console.log(`[Threading] Compito ${taskId} rilasciato per riutilizzo.`);
            return true;
        }
        return false;
    }

    /**
     * Aggiunge un listener per la ricezione dei messaggi da TUTTI i worker.
     * Dopo la ricezione, il compito viene rilasciato dalla mappa.
     * @param {function(MessageEvent): void} listener - La funzione di callback da eseguire.
     */
    addWorkerMessageListener(listener) {
        this.#workerPool.forEach(worker => {
            worker.onmessage = (e) => {
                // Rilascia lo slot del pool solo dopo che il compito è stato completato
                if (e.data && e.data.taskId) {
                    this.#releaseTask(e.data.taskId);
                }
                listener(e);
            };
        });
    }

    /**
     * Termina forzatamente un compito attivo.
     * Nota: Questo non termina il worker stesso, ma solo l'associazione con il taskId.
     * Se devi terminare un worker, devi usare un messaggio "cancel" al worker stesso,
     * o chiamare terminateAll() per chiudere tutti i worker.
     * @param {string} taskId - L'ID del compito da terminare.
     * @returns {boolean} - True se il worker era mappato e l'associazione è stata rimossa.
     */
    terminateTask(taskId) {
        // Per annullare davvero un compito, dovremmo inviare un messaggio 'cancel' al worker.
        // Qui, ci limitiamo a rimuovere l'associazione. Il worker finirà il suo lavoro.
        const worker = this.#activeWorkerMap.get(taskId);
        if (worker) {
            console.log(`[Threading] Compito ${taskId} disassociato. Il worker completerà il lavoro.`);
            // Potresti inviare un messaggio di annullamento qui, se il worker è progettato per riceverlo:
            // worker.postMessage({ command: 'cancel', taskId: taskId });
            return this.#releaseTask(taskId);
        }
        return false;
    }

    /**
     * Termina tutti i worker nel pool e svuota la mappa dei compiti attivi.
     */
    terminateAll() {
        this.#workerPool.forEach(worker => {
            worker.terminate();
        });
        this.#workerPool = [];
        this.#activeWorkerMap.clear();
        console.log("[Threading] Tutti i worker terminati e pool distrutto.");
    }
    
    /**
     * Restituisce il numero di compiti attualmente in esecuzione.
     */
    getRunningTaskCount() {
        return this.#activeWorkerMap.size;
    }
}
