# Definisce il nome della directory radice
$RootDirectory = "."

# Lista delle directory da creare, con il percorso relativo a $RootDirectory
$Directories = @(
    # Dati
    "data/regions",
    "data/source",
    "data/textures",

    # Codice Sorgente
    "src/core",
    "src/data",
    "src/meshing",
    "src/renderer",

    # Strumenti
    "tools"
)

# 1. Crea la directory radice
Write-Host "Creazione della directory radice: $RootDirectory"
New-Item -Path $RootDirectory -ItemType Directory -Force | Out-Null

# 2. Cicla e crea le sottodirectory
Write-Host "Creazione delle sottodirectory..."
foreach ($Dir in $Directories) {
    $FullPath = Join-Path -Path $RootDirectory -ChildPath $Dir
    Write-Host "  -> Creazione di $FullPath"
    New-Item -Path $FullPath -ItemType Directory -Force | Out-Null
}

# 3. Creazione dei file placeholder
Write-Host "Creazione dei file placeholder essenziali..."

# File Radice
New-Item -Path (Join-Path -Path $RootDirectory -ChildPath "index.html") -ItemType File -Force | Out-Null
New-Item -Path (Join-Path -Path $RootDirectory -ChildPath "package.json") -ItemType File -Force | Out-Null
New-Item -Path (Join-Path -Path $RootDirectory -ChildPath "README.md") -ItemType File -Force | Out-Null

# File di Configurazione e Logica
New-Item -Path (Join-Path -Path $RootDirectory -ChildPath "src/core/config.js") -ItemType File -Force | Out-Null

# Strumenti
New-Item -Path (Join-Path -Path $RootDirectory -ChildPath "tools/generate_octrees.js") -ItemType File -Force | Out-Null

Write-Host "✅ Struttura del progetto '$RootDirectory' creata con successo!"