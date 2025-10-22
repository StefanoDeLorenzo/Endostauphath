import { OctreeNode } from './OctreeNode.js'; 
import CONFIG from '../core/config.js';

/**
 * Gestisce la serializzazione (Oggetto -> ArrayBuffer) e la deserializzazione 
 * (ArrayBuffer -> Oggetto) della struttura dati OctreeNode.
 * NON ha dipendenze da I/O o cache.
 */
export class OctreeSerializer {
    
    /**
     * Deserializza un ArrayBuffer binario in un OctreeNode.
     * Include controlli di sicurezza per evitare di leggere oltre i limiti del buffer.
     * @param {ArrayBuffer} buffer Il buffer binario del Mini-Chunk.
     * @returns {OctreeNode} La radice dell'Octree.
     */
    static deserialize(buffer) {
        // 1. Controlli Iniziali di Validità
        if (!buffer || buffer.byteLength === 0) {
            // Se il buffer non esiste o è vuoto (segno di un chunk EMPTY/ARIA non serializzato),
            // restituisci una foglia ARIA/EMPTY a livello 0.
            return new OctreeNode(0, CONFIG.VOXEL_ID_AIR); 
        }

        const data = new Uint8Array(buffer);
        let readOffset = 0;
        
        // Helper per la lettura del prossimo byte con controllo di confine
        const readNextByte = () => {
            if (readOffset >= data.length) {
                // ERRORE CRITICO: Il file è finito inaspettatamente. 
                // Segnala un file Octree malformato (troncato).
                throw new Error("Octree Deserialization Error: Buffer ended unexpectedly. File is likely corrupted.");
            }
            const byte = data[readOffset];
            readOffset++;
            return byte;
        };

        const readNodeRecursive = (level) => {
            const stateByte = readNextByte(); // Leggiamo il prossimo byte

            if (stateByte === CONFIG.VOXEL_ID_CUT) {
                // Caso MIXED (Nodo Interno)
                
                const node = new OctreeNode(level, CONFIG.VOXEL_ID_CUT); 
                node.children = []; // Inizializza l'array figli

                for (let i = 0; i < 8; i++) {
                    const child = readNodeRecursive(level + 1);
                    if (!child) {
                        // Se la ricorsione fallisce qui, il file è troncato
                        throw new Error(`Octree Deserialization Error: Missing child node at level ${level + 1}.`);
                    }
                    node.children.push(child);
                }
                
                return node;
                
            } else {
                // Caso FOGLIA (EMPTY o SOLID)
                // stateByte è il Material ID (0-254)
                return new OctreeNode(level, stateByte); 
            }
        };

        try {
            const rootNode = readNodeRecursive(0);
            
            // 2. Controllo Finale di Validità (Byte Eccessivi)
            if (readOffset !== data.length) {
                console.warn(`Octree Deserialization Warning: ${data.length - readOffset} extraneous bytes found at the end of the chunk buffer. File may contain garbage data.`);
            }

            return rootNode;
            
        } catch (error) {
            console.error(error.message);
            // In caso di errore critico, restituiamo un Octree vuoto (Aria) per non bloccare il gioco.
            return new OctreeNode(0, CONFIG.VOXEL_ID_AIR); 
        }
    }

    /**
     * Serializza l'albero Octree a partire dalla radice in un ArrayBuffer binario.
     * Utilizza la tecnica del byte unico per codificare lo stato (Foglia 0-254) o (Interno 255).
     * @param {OctreeNode} root La radice dell'Octree da serializzare.
     * @returns {ArrayBuffer} Il payload binario del chunk.
     */
    static serialize(root) {
        const bytes = [];
        
        // Funzione ricorsiva che esegue la traversata in Pre-ordine
        const writeNode = (node) => {
            
            // 1. SCELTA DEL BYTE DI STATO/MATERIALE
            
            // CASO FOGLIA (0 - 254)
            // Usiamo il materialID per la massima sicurezza, non solo isLeaf()
            if (node.materialID !== CONFIG.VOXEL_ID_CUT) { 
                
                let stateByte = node.materialID;
                
                // NOTA: Il materialID deve essere <= 254 (VOXEL_ID_CUT - 1)
                if (stateByte >= CONFIG.VOXEL_ID_CUT) {
                    console.warn(`Octree Serialization Warning: Leaf node found with ID ${stateByte}. Overriding to AIR (0).`);
                    stateByte = CONFIG.VOXEL_ID_AIR;
                }
                
                bytes.push(stateByte);
                return;
            }
            
            // CASO NODO INTERNO (MIXED - 255)

            // **** CORREZIONE CRITICA DELL'ERRORE 'without children' ****
            // Un nodo MIXED deve sempre avere l'array figli esistente e completo.
            if (!node.children || node.children.length !== 8) {
                 throw new Error(`Octree Serialization Error: Mixed node at level ${node.level} must have exactly 8 children. Found ${node.children ? node.children.length : 'none'}.`);
            }
            
            // Scriviamo il flag riservato che indica che 8 figli seguono.
            bytes.push(CONFIG.VOXEL_ID_CUT); // 255
            
            // 2. RICORSIONE (solo per nodi MIXED/Interni)
            for (let i = 0; i < 8; i++) {
                // Non serve controllare 'if (node.children[i])' se il controllo di lunghezza è passato
                writeNode(node.children[i]);
            }
        };

        try {
            writeNode(root);
            return new Uint8Array(bytes).buffer;
        } catch (error) {
            console.error("Critical Serialization Failure:", error);
            // In caso di errore critico, restituisci un buffer vuoto (o un buffer con un solo nodo AIR)
            return new Uint8Array([CONFIG.VOXEL_ID_AIR]).buffer; 
        }
    }
}
