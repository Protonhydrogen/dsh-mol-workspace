/** Passthrough schema: the registry only calls `.parse()`, so identity parsing
 *  satisfies the contract without pulling a validation library into the bundle. */
const passthroughSchema = { parse: (value) => value };

const initial = () => ({ lastInjectedSelection: null, injectedCount: 0 });

/**
 * Log-derivable molecular context. Folds "Add to Chat" injections (durable
 * `agent/inbox/spliced` events carrying `source.kind === 'molecular-workspace'`)
 * into plain-JSON state so the model-visible molecular context is recoverable
 * from the Session Log alone. Live state for the viewer flows through the
 * `followState` Remote stream; this unit is the durable, reconstructable face.
 */
export const molecularProjection = {
  key: 'molecular',
  stateSchema: passthroughSchema,
  init: initial,
  apply(state, event) {
    if (event.type !== 'agent/inbox/spliced') return state;
    const inserted = event.data?.inserted;
    if (!Array.isArray(inserted)) return state;
    for (const message of inserted) {
      if (message?.source?.kind !== 'molecular-workspace') continue;
      const text = message.content?.[0]?.text ?? null;
      if (typeof text !== 'string' || text === state.lastInjectedSelection) continue;
      return { lastInjectedSelection: text, injectedCount: state.injectedCount + 1 };
    }
    return state;
  },
  wire: {
    viewSchema: passthroughSchema,
    view: (state) => state,
  },
  stateVersion: 1,
};
