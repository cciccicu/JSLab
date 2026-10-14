function unavailableError(featureName) {
  const error = new Error(featureName + ' 在当前设备上不可用');
  error.code = 203;
  return error;
}

function createUnavailableModule(featureName, methodNames) {
  const module = { __available: false };
  methodNames.forEach((methodName) => {
    module[methodName] = (options) => {
      const error = unavailableError(featureName);
      if (options && (typeof options.fail === 'function' || typeof options.complete === 'function')) {
        setTimeout(() => {
          try { if (typeof options.fail === 'function') options.fail(error.message, 203); }
          finally { if (typeof options.complete === 'function') options.complete(); }
        }, 0);
        return;
      }
      throw error;
    };
  });
  return module;
}

/**
 * 加载可能因设备型号或系统版本而缺失的系统模块。
 * 保留 manifest 声明，使支持该能力的设备（例如后续型号）仍可正常使用。
 */
export function loadOptionalSystemModule(app, featureName, methodNames, loader) {
  try {
    const capabilityName = '@' + featureName;
    if (app && typeof app.canIUse === 'function' && !app.canIUse(capabilityName)) {
      return createUnavailableModule(featureName, methodNames);
    }
    return loader();
  } catch (error) {
    return createUnavailableModule(featureName, methodNames);
  }
}

/**
 * 使用原生 $nextTick；缺失时仅安排下一轮事件循环，不保证原生绘制已完成。
 */
export function scheduleNextTick(context, callback) {
  if (context && typeof context.$nextTick === 'function') {
    context.$nextTick(callback);
    return;
  }
  setTimeout(callback, 0);
}

/**
 * $element 同样是版本相关的实例方法；不可用时让调用方降级而不是中断页面。
 */
export function getPageElement(context, id) {
  if (!context || typeof context.$element !== 'function') return null;
  return context.$element(id);
}
