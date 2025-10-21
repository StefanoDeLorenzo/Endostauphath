/Endostauphath
├── /data/                  # Dati di input e output compressi
│   ├── /regions/           # File Regione binari generati (Chunk Compressione)
│   ├── /source/            # File di input grezzi (ad esempio, il tuo vecchio 30x30x30)
│   └── /textures/          # Texture atlas per i materiali dei voxel
|
├── /src/                   # Codice sorgente JavaScript
│   ├── /core/              # Logica fondamentale del motore (indipendente dalla grafica)
│   │   ├── config.js       # File di configurazione definito
│   │   └── World.js        # Gestore di alto livello della Mappa/Regioni/Cache
│   |
│   ├── /data/              # Strutture dati in memoria e accesso
│   │   ├── OctreeNode.js   # Definizione della struttura Octree in RAM
│   │   ├── RegionFile.js   # Logica di I/O (carica, decompressione File Regione)
│   │   └── VoxelAccessor.js# Gestore dell'accesso O(logN) ai dati
│   |
│   ├── /meshing/           # Algoritmi di generazione della mesh
│   │   ├── DualContouring.js # Implementazione del DC/QEF
│   │   └── LODManager.js   # Logica di traversata dell'Octree e LOD culling
│   |
│   └── /renderer/          # Codice specifico per WebGL/Grafica
│       ├── Camera.js       # Gestione della telecamera e Frustum Culling
│       ├── Renderer.js     # Interfaccia WebGL/Scene Setup
│       └── Shaders.js      # Definizione degli shader (per materiali/luci)
|
├── /tools/                 # Strumenti di pre-processamento (Node.js/Python)
│   ├── generate_octrees.js # Script per convertire i dati grezzi in File Regione compressi
│   └── index_builder.js    # Script per creare la Tabella Indici Esterna
|
├── index.html              # Pagina principale che carica il motore
├── package.json            # Metadati e dipendenze di Node/npm
└── README.md