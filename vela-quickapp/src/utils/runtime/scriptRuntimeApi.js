import app from '@system.app';
import device from '@system.device';
import configuration from '@system.configuration';
import file from '@system.file';
import network from '@system.network';
import brightness from '@system.brightness';
import geolocation from '@system.geolocation';
import vibrator from '@system.vibrator';
import sensor from '@system.sensor';
import fetch from '@system.fetch';
import interconnect from '@system.interconnect';
import uploadtask from '@system.uploadtask';
import request from '@system.request';
import prompt from '@system.prompt';
import crypto from '@system.crypto';
import { createScriptStorage } from './scriptData.js';
import { createScriptDialogApi } from './scriptDialogApi.js';
import { loadOptionalSystemModule } from '../core/runtimeCompat.js';

const battery = loadOptionalSystemModule(app, 'system.battery', ['getStatus'], () => require('@system.battery'));
const event = loadOptionalSystemModule(app, 'system.event', ['publish', 'subscribe', 'unsubscribe'], () => require('@system.event'));
const record = loadOptionalSystemModule(app, 'system.record', ['start', 'stop'], () => require('@system.record'));
const audio = loadOptionalSystemModule(app, 'system.audio', ['play', 'pause', 'stop', 'getPlayState'], () => require('@system.audio'));

function clampDuration(value) {
  const duration = Number(value);
  if (isNaN(duration)) return 1500;
  return Math.min(10000, Math.max(1500, duration));
}

export function createScriptRuntimeApi(appDefinition, options) {
  const name = String(options.name || 'untitled.js');
  const mode = options.mode === 'ui' ? 'ui' : 'console';
  const isActive = options.isActive;
  const storage = createScriptStorage(name);
  return {
    script: {
      name,
      mode,
      canUse(capability) {
        try { return !!app.canIUse(capability); } catch (error) { return false; }
      },
      locale() {
        try { return configuration.getLocale(); } catch (error) { return { language: '', countryOrRegion: '' }; }
      },
      exit() {
        if (isActive()) options.exit();
      },
      toast(message, duration) {
        if (!isActive()) return;
        prompt.showToast({ message: String(message == null ? '' : message), duration: clampDuration(duration) });
      },
      data: storage.data,
      config: storage.config
    },
    dialog: createScriptDialogApi(appDefinition, isActive),
    system: {
      device,
      files: file,
      http: { request: options => fetch.fetch(options) },
      download: { start: options => request.download(options), wait: options => request.onDownloadComplete(options) },
      upload: { file: options => uploadtask.uploadFile(options) },
      companion: interconnect,
      network,
      display: brightness,
      battery,
      location: geolocation,
      vibration: vibrator,
      events: event,
      sensors: sensor,
      recorder: record,
      audio,
      crypto
    }
  };
}

export default { createScriptRuntimeApi };
