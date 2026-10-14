// Compiler snapshots stay outside the ViewModel. Only these copies are observed
// by Vela; comparisons never read reactive fields or mutate compiler caches.
function copyNode(node) {
  const copy = {};
  for (const key in node) if (key !== 'autoLines') copy[key] = node[key];
  return copy;
}

function patchNode(target, next, before) {
  if (next === before) return;
  // Compiled nodes have a fixed painted schema for each kind. autoLines is
  // compiler-only metadata, so switching explicit/automatic lines adds no
  // reactive property and needs no replacement of the node.
  for (const key in next) {
    if (key !== 'autoLines' && next[key] !== before[key]) target[key] = next[key];
  }
}

export function createUiPublisher() {
  let previous = [];
  return {
    update(nodes, observed) {
      if (nodes === previous) return observed;
      const aligned = observed.length === previous.length;
      let stable = aligned && nodes.length === previous.length;
      if (stable) {
        for (let i = 0; i < nodes.length; i += 1) {
          if (nodes[i].id !== previous[i].id || nodes[i].kind !== previous[i].kind) { stable = false; break; }
        }
      }
      let result = observed;
      if (stable) {
        for (let i = 0; i < nodes.length; i += 1) {
          if (nodes[i] !== previous[i]) patchNode(observed[i], nodes[i], previous[i]);
        }
      } else {
        const retained = Object.create(null);
        if (aligned) {
          for (let i = 0; i < previous.length; i += 1) retained[previous[i].id] = i;
        }
        result = nodes.map(node => {
          const index = retained[node.id];
          if (index !== undefined && previous[index].kind === node.kind) {
            patchNode(observed[index], node, previous[index]);
            return observed[index];
          }
          return copyNode(node);
        });
      }
      previous = nodes;
      return result;
    }
  };
}
