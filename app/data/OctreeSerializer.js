import { OctreeNode } from './OctreeNode.js'; 
import CONFIG from '../core/config.js';

/**
 * Gestisce la serializzazione (Oggetto -> ArrayBuffer) e la deserializzazione 
 * (ArrayBuffer -> Oggetto) della struttura dati OctreeNode.
 * NON ha dipendenze da I/O o cache.
 */
export class OctreeSerializer {
    
    /**
     * Converte un ArrayBuffer binario in un oggetto OctreeNode (Ricostruzione dell'albero).
     * @param {ArrayBuffer} buffer Dati binari serializzati del Mini-Chunk.
     * @returns {OctreeNode} La radice del Mini-Chunk ricostruito.
     */
    static deserialize(buffer) {
        if (!buffer || buffer.byteLength === 0) {
            // Caso 1: ArrayBuffer vuoto = Mini-Chunk totalmente vuoto (Aria)
            return new OctreeNode(0, CONFIG.VOXEL_ID_AIR); 
        }
        
        // Creiamo un DataView per leggere i tipi di dato con l'endianness corretto.
        const dataView = new DataView(buffer);
        let byteOffset = 0;
        
        // Funzione ricorsiva o iterativa per leggere i nodi.
        const readNode = (level) => {
            // Esempio: Leggiamo 1 byte per lo Stato e il MaterialID
            // Il formato del primo byte deve essere concordato:
            // Bit 0-1: Stato (EMPTY/SOLID/MIXED)
            // Bit 2-7: MaterialID (o solo i primi 6 bit)
            
            // Per semplicità, assumiamo che il primo byte sia lo stato (0, 1, o 2)
            const state = dataView.getUint8(byteOffset);
            byteOffset += 1;
            
            if (state === OctreeNode.STATE.EMPTY || state === OctreeNode.STATE.SOLID) {
                // Nodo Foglia: Leggiamo l'ID del Materiale (es. 1 byte)
                const materialID = dataView.getUint8(byteOffset);
                byteOffset += 1;
                return new OctreeNode(level, materialID);
            }
            
            // Nodo Interno (MIXED): Non ha un ID materiale in questo punto.
            const node = new OctreeNode(level, 0); // Lo stato verrà aggiornato a MIXED
            node.initializeChildren();
            node.state = OctreeNode.STATE.MIXED; // Forza lo stato MIXED
            
            // Ricorsione per i 8 figli
            for (let i = 0; i < 8; i++) {
                node.children[i] = readNode(level + 1);
            }
            
            return node;
        };
        
        return readNode(0); // Inizia la lettura dalla radice (Livello 0)
    }

    /**
     * Converte un OctreeNode in un ArrayBuffer binario compresso (Serializzazione).
     * @param {OctreeNode} root Il nodo radice del Mini-Chunk.
     * @returns {ArrayBuffer} Dati binari serializzati.
     */
    /**
     * Converte un OctreeNode in un ArrayBuffer binario compresso (Serializzazione).
     * @param {OctreeNode} root Il nodo radice del Mini-Chunk.
     * @returns {ArrayBuffer} Dati binari serializzati.
     */
    static serialize(root) {
        const bytes = [];
        
        // Funzione ricorsiva che scrive i byte nell'array 'bytes'
        const writeNode = (node) => {
            
            // 1. Scrive lo Stato (1 byte)
            bytes.push(node.state); 
            
            // --- Caso FOGLIA (EMPTY o SOLID) ---
            if (node.isLeaf()) {
                // 2. Scrive il Material ID (1 byte)
                // Se il nodo è vuoto, viene scritto CONFIG.VOXEL_ID_AIR (0).
                // Se è solido, viene scritto il suo Material ID (1-254).
                bytes.push(node.materialID); 
                
                // NOTA SUL DC: Se devi salvare surfaceData, la logica andrebbe qui, 
                // con un formato più complesso che include i float per posizione e normale.
                return;
            }
            
            // --- Caso NODO INTERNO (MIXED) ---
            
            // Ricorsione: Scrive gli 8 figli
            for (let i = 0; i < 8; i++) {
                if (node.children[i]) {
                    writeNode(node.children[i]);
                } else {
                    // Questo non dovrebbe succedere se il pruning è corretto,
                    // ma è un fallback di sicurezza.
                    console.error("Errore di serializzazione: figlio nullo in nodo MIXED.");
                }
            }
        };

        // Inizia la scrittura dalla radice
        writeNode(root);
        
        // Converte l'array di byte temporaneo in ArrayBuffer finale
        return new Uint8Array(bytes).buffer;
    }
}