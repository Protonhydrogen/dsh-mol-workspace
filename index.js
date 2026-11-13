/** Host half of the Molecular Workspace bundle. */
import { MolecularContextService, MOLECULAR_TYPERT } from './src/host/molecular-service.js';
import { molecularProjection } from './src/host/molecular-projection.js';
import { registerMolecularTools } from './src/host/molecular-tools2.js';

export const inject = ['tools', 'sessionProjections', 'typert', 'fs', 'agents', 'systemPrompt'];

export function apply(ctx) {
  // Register the single authoritative Molecular Context Service (also binds the
  // `molecular` Remote namespace via TypertRemoteService).
  const service = new MolecularContextService(ctx, 'molecular');

  // Hand-written Typert host manifest: schemas/invocations for ctx.remote.molecular.
  //
  // The registry rejects a duplicate endpoint/id, and its `history` set is never
  // cleared: an endpoint that was committed once and then withdrawn can never be
  // re-registered, and the gateway refuses the SRC fallback for it. On a live
  // patch reload (profile `patchReload: "live"`) the previous instance's
  // descriptors can still be committed for a tick, so a single attempt would
  // throw "already registered" and leave `molecular/*` permanently withdrawn.
  // Back off and retry instead of failing once.
  ctx.effect(() => {
    let disposed = false;
    let disposer;
    let tries = 0;
    const attempt = () => {
      if (disposed) return;
      try {
        disposer = ctx.typert.register(MOLECULAR_TYPERT);
      } catch (err) {
        if (tries < 40) {
          tries += 1;
          setTimeout(attempt, 50);
        } else {
          console.error('[molecular] typert register failed', err);
        }
      }
    };
    attempt();
    return () => {
      disposed = true;
      try {
        disposer?.();
      } catch (err) {
        console.error('[molecular] typert withdraw failed', err);
      }
    };
  }, 'molecular-workspace: typert');

  // Log-derivable molecular context (Add to Chat selections).
  ctx.effect(() => ctx.sessionProjections.register(molecularProjection), 'molecular-workspace: projection');

  registerMolecularTools(ctx, service);
  ctx.effect(() => () => service.flushPersistence(), 'molecular-workspace: persistence');
}
