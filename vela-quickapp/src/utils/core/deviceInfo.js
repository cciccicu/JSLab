import device from '@system.device';

const FALLBACK_DEVICE_NAME = 'JSLab 设备';

function cleanPart(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function formatDeviceName(info) {
  const value = info || {};
  const brand = cleanPart(value.brand || value.manufacturer);
  const model = cleanPart(value.model || value.product);
  const type = cleanPart(value.deviceType);

  if (brand && model && brand.toLowerCase() !== model.toLowerCase()) return (brand + ' ' + model).slice(0, 80);
  if (model) return model.slice(0, 80);
  if (brand) return brand.slice(0, 80);
  if (type === 'band') return 'JSLab 手环';
  if (type === 'watch') return 'JSLab 手表';
  return FALLBACK_DEVICE_NAME;
}

export function getDeviceName() {
  return new Promise((resolve) => {
    try {
      device.getInfo({
        success: info => resolve(formatDeviceName(info)),
        fail: () => resolve(FALLBACK_DEVICE_NAME)
      });
    } catch (error) {
      resolve(FALLBACK_DEVICE_NAME);
    }
  });
}

export default { formatDeviceName, getDeviceName };
