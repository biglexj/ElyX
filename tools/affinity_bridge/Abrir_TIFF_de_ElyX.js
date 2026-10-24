// Ejecutable dentro de Affinity. Selecciona el TIFF generado por el puente.
// El .elx se decodifica antes mediante el ayudante Python incluido.
const { Application } = require('/application.js');
const { Document } = require('/document.js');
try {
    const path = Application.chooseFile();
    if (path) {
        const filename = String(path).toLowerCase();
        if (!filename.endsWith('.tif') && !filename.endsWith('.tiff')) {
            throw new Error('Selecciona el TIFF que generó el puente ElyX. Este script no decodifica .elx directamente.');
        }
        const doc = Document.load(path);
        console.log(JSON.stringify({title:doc.title,width:doc.widthPixels,height:doc.heightPixels,session:String(doc.sessionUuid)}));
    }
} catch (error) {
    console.error(error);
    Application.alert('ElyX: ' + (error.message || String(error)), 'Abrir TIFF de ElyX');
}
