const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeFilename(filename) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'document';
    return `${base}${ext.toLowerCase()}`;
}

function uniqueDestination(dir, filename) {
    ensureDir(dir);
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let destination = path.join(dir, filename);
    let counter = 1;
    while (fs.existsSync(destination)) {
        destination = path.join(dir, `${base}-${counter}${ext}`);
        counter += 1;
    }
    return destination;
}

function saveLocalFile(sourcePath, destinationDirParts) {
    const filename = safeFilename(path.basename(sourcePath));
    const destinationDir = path.join(...destinationDirParts);
    const destination = uniqueDestination(destinationDir, filename);
    fs.copyFileSync(sourcePath, destination);
    const stat = fs.statSync(destination);
    return {
        provider: 'local',
        filename: path.basename(destination),
        filepath: destination,
        local_cache_path: destination,
        mime_type: null,
        file_size: stat.size,
        sync_status: 'local'
    };
}

module.exports = {
    ensureDir,
    safeFilename,
    uniqueDestination,
    saveLocalFile
};
