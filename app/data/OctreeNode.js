import CONFIG from '../core/config.js'; 

/**
 * Rappresenta un nodo nell'albero Octree per la compressione spaziale.
 * Conserva i dati del materiale e dello stato di compressione.
 */
export class OctreeNode {
    
    // Stato di compressione/potatura:
    static STATE = {
        EMPTY: 0, // Foglia uniforme: interamente Aria.
        SOLID: 1, // Foglia uniforme: interamente un Materiale solido.
        MIXED: 2  // Interno: Contiene stati diversi (deve essere suddiviso).
    };
    
    
    /**
     * @param {number} level Il livello di profondità.
     * @param {number} materialID L'ID del materiale uniforme (0 per Aria) se il nodo è una Foglia.
     */
    constructor(level, materialID = CONFIG.VOXEL_ID_AIR) {
        this.level = level;
        
        // Materiale del volume: Sempre conservato per le Foglie (EMPTY/SOLID).
        this.materialID = materialID; 
        
        // Stato di compressione (sempre derivato da materialID se uniforme)
        if (materialID === CONFIG.VOXEL_ID_AIR) {
            this.state = OctreeNode.STATE.EMPTY;
            this.materialID = CONFIG.VOXEL_ID_AIR; // Mantieni 0
        } else if(materialID === CONFIG.VOXEL_ID_CUT){
            // Nodi interni/taglio: Non hanno un materiale uniforme.
            this.state = OctreeNode.STATE.MIXED;
            this.materialID = CONFIG.VOXEL_ID_CUT; // Mantieni il flag 255
        } else { 
            // Tutti gli altri ID (1 a 254) sono solidi
            this.state = OctreeNode.STATE.SOLID;
            this.materialID = materialID;
        }
        
        // Array per 8 figli. È un array di 8 solo se lo stato è MIXED.
        this.children = null; 

        // Dati specifici per il Dual Contouring e il Taglio (VOXEL_ID_CUT):
        // Questi dati sono presenti solo per i nodi MIXED che contengono una superficie
        // e vengono usati per memorizzare il punto di intersezione (QEF Solution)
        // e la normale della superficie in quel volume.
        this.surfaceData = null; // Es: { position: [x,y,z], normal: [nx,ny,nz] }
        
        // Voxel grezzi al massimo dettaglio (Livello 9)
        this.subVoxelData = null; 
    }

    /**
     * Controlla se il nodo è una Foglia (uniforme e compresso).
     * @returns {boolean}
     */
    isLeaf() {
        return this.state === null;
    }
    
    /**
     * Inizializza l'array dei figli e imposta lo stato a MIXED (nodo interno).
     */
    initializeChildren() {
        if (this.state !== OctreeNode.STATE.MIXED) {
            this.children = new Array(8).fill(null);
            this.state = OctreeNode.STATE.MIXED;
            
            // Il materialID non ha più significato per il volume MIXED, 
            // ma lo conserviamo per il futuro se dovesse servire un 'colore' dominante.
            // Spesso è sufficiente impostarlo a un valore neutro (es. -1).
            this.materialID = CONFIG.VOXEL_ID_AIR;; 
        }
    }
}