const JSZip = require('jszip');
Object.defineProperty(exports,'__esModule',{value:true});
class ZipUtil {
  static CERT_PATH = 'META-INF/CERT';
  static DIGEST_HASH_JSON = 'hash.json';
  static ZIP_OPTION = {type:'nodebuffer', compression:'DEFLATE', compressionOptions:{level:9}};
  static async createZipBufferFromFileList(files,comment) {
    const zip=new JSZip();
    for (const file of files) zip.file(file.path,file.content,{createFolders:false});
    return zip.generateAsync({...this.ZIP_OPTION,comment});
  }
}
exports.default=ZipUtil;
