// jsManager.js
import file from '@system.file';

const JS_DIR = 'internal://files/js/';

function ensureDirExists(uri) {
  return new Promise((resolve, reject) => {
    const dirUri = uri.endsWith('/') ? uri : uri + '/';
    file.access({
      uri: dirUri,
      success: () => resolve(true),
      fail: (data, code) => {
        file.mkdir({
          uri: dirUri,
          recursive: true,
          success: () => resolve(true),
          fail: (data, code) => reject(new Error(`Failed to create directory: ${code}`))
        });
      }
    });
  });
}

export default {
  listjs() {
    return new Promise((resolve, reject) => {
      ensureDirExists(JS_DIR)
        .then(() => {
          file.list({
            uri: JS_DIR,
            success: (data) => {
              const jsFiles = data.fileList
                .filter(file => file.uri.endsWith('.js'))
                .map(file => ({
                  name: file.uri.substring(file.uri.lastIndexOf('/') + 1),
                  size: file.length.toString()
                }));
              resolve(jsFiles);
            },
            fail: (data, code) => reject(new Error(`Failed to list files: ${code}`))
          });
        })
        .catch(error => reject(error));
    });
  },

  getjs(name) {
    return new Promise((resolve, reject) => {
      const fileUri = `${JS_DIR}${name}`;
      ensureDirExists(JS_DIR)
        .then(() => {
          file.readText({
            uri: fileUri,
            success: (data) => resolve(data.text),
            fail: (data, code) => reject(new Error(`Failed to read file: ${code}`))
          });
        })
        .catch(error => reject(error));
    });
  },

  savejs(name, content) {
    return new Promise((resolve, reject) => {
      const fileUri = `${JS_DIR}${name}`;
      ensureDirExists(JS_DIR)
        .then(() => {
          file.writeText({
            uri: fileUri,
            text: content,
            success: () => resolve(),
            fail: (data, code) => reject(new Error(`Failed to write file: ${code}`))
          });
        })
        .catch(error => reject(error));
    });
  },

  deletejs(name) {
    return new Promise((resolve, reject) => {
      const fileUri = `${JS_DIR}${name}`;
      ensureDirExists(JS_DIR)
        .then(() => {
          file.delete({
            uri: fileUri,
            success: () => resolve(),
            fail: (data, code) => reject(new Error(`Failed to delete file: ${code}`))
          });
        })
        .catch(error => reject(error));
    });
  }
};