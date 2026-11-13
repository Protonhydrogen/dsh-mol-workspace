/**
 * Loopback server that hosts the live renderer tests.
 *
 *   node tests/build.mjs && node --experimental-loader ./tests/resolve-loader.mjs tests/browser-server.mjs
 *
 * Serves the harness page plus a JSON RPC bridge onto MolecularContextService,
 * so tests/live*.test.mjs can drive the real renderer through a browser. Binds
 * 127.0.0.1 only. The page it serves is whatever `tests/build.mjs` emitted into
 * OUT_DIR.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { MolecularContextService } from '../src/host/service-v3.js';
import { SessionPersistence } from '../src/host/persistence.js';
import { REPO, OUT_DIR } from './paths.mjs';

const PORT = Number(process.env.DSH_MOL_PORT || 43130);

// The page and the RPC bridge live in the build output; files the tests ask the
// viewer to load resolve against the repository root, so `fixtures/1qys.cif`
// means the checked-in fixture rather than a path on the author's machine.
const service = Object.create(MolecularContextService.prototype);
Object.assign(service, {
  _sessions: new Map(),
  _validated: new Set(),
  _persistence: new SessionPersistence(join(OUT_DIR, 'state')),
});
Object.defineProperty(service, 'ctx', {
  value: {
    agents: {
      get: () => ({
        session: { header: { cwd: REPO }, inject: (msg) => console.log('CHAT', JSON.stringify(msg)) },
      }),
    },
    fs: {
      resolve: async (path) => ({
        nativePath: isAbsolute(path) ? path : resolve(REPO, path),
        displayPath: path,
      }),
      stat: async (path) => ({
        type: (await stat(isAbsolute(path) ? path : resolve(REPO, path))).isFile() ? 'file' : 'directory',
      }),
      readText: async (path) => readFile(isAbsolute(path) ? path : resolve(REPO, path), 'utf8'),
    },
  },
});

http
  .createServer(async (req, res) => {
    try {
      if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(
          '<!doctype html><html><head><meta charset="utf-8"><title>DSH Molecular Workspace validation</title>' +
            '<style>html,body,#app{height:100%;margin:0;background:#0b0c10}</style></head>' +
            '<body><div id="app"></div><script src="/harness.js"></script></body></html>',
        );
        return;
      }
      if (req.url === '/harness.js') {
        res.setHeader('Content-Type', 'text/javascript');
        createReadStream(join(OUT_DIR, 'harness.js')).pipe(res);
        return;
      }
      if (req.url?.startsWith('/api/')) {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const method = req.url.slice(5);
        if (typeof service[method] !== 'function' || method.startsWith('_')) throw new Error('Unknown method');
        const value = await service[method]('audit-v4', ...JSON.parse(raw || '[]'));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, value }));
        return;
      }
      res.statusCode = 404;
      res.end();
    } catch (e) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: { code: e.code, message: e.message } }));
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`New viewer: http://127.0.0.1:${PORT}/`));
