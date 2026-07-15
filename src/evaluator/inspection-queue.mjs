import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ensureDir, exists, readJson, writeJson } from '../lib/fs-json.mjs';

// Persistent, single-at-a-time inspection run queue. Only one run-inspection
// child executes at a time; the rest wait in an ordered pending list. State is
// persisted to disk so the queue survives a dashboard restart, and a run left
// mid-flight by a restart is reconciled rather than left as "running".

const HISTORY_LIMIT = 30;

export class InspectionQueue {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.queuePath = path.join(rootDir, 'tmp', 'inspection-queue.json');
    this.logDir = path.join(rootDir, 'tmp', 'dashboard-runs');
    this.children = new Map();
    this.counter = 0;
    this.items = this._load();
    this._reconcile();
    this._tick();
  }

  _load() {
    if (!exists(this.queuePath)) return [];
    try {
      return readJson(this.queuePath).items || [];
    } catch {
      return [];
    }
  }

  _persist() {
    ensureDir(path.dirname(this.queuePath));
    writeJson(this.queuePath, { schema_version: 'inspection-queue-v0.1', updated_at: new Date().toISOString(), items: this.items });
  }

  // A restart cannot leave an item genuinely running: the child died with the
  // old process. Mark such items interrupted so the queue does not stall.
  _reconcile() {
    let changed = false;
    for (const item of this.items) {
      if (item.status === 'running') {
        item.status = 'interrupted';
        item.ended_at = new Date().toISOString();
        item.error = 'Dashboard restarted while this run was in progress.';
        changed = true;
      }
    }
    // Trim history to keep the file small.
    const active = this.items.filter((item) => ['pending', 'running'].includes(item.status));
    const finished = this.items.filter((item) => !['pending', 'running'].includes(item.status)).slice(-HISTORY_LIMIT);
    this.items = [...finished, ...active];
    if (changed) this._persist();
  }

  _nextId() {
    this.counter += 1;
    return `q-${Date.now()}-${this.counter}`;
  }

  enqueue({ kind, label, argv }) {
    const item = {
      id: this._nextId(),
      kind,
      label,
      argv,
      status: 'pending',
      enqueued_at: new Date().toISOString(),
      started_at: null,
      ended_at: null,
      pid: null,
      log_path: null,
      exit_code: null,
      error: null
    };
    this.items.push(item);
    this._persist();
    this._tick();
    return { id: item.id, status: item.status, position: this.items.filter((entry) => entry.status === 'pending').findIndex((entry) => entry.id === item.id) + 1 };
  }

  _running() {
    return this.items.find((item) => item.status === 'running');
  }

  _tick() {
    if (this._running()) return;
    const next = this.items.find((item) => item.status === 'pending');
    if (!next) return;
    this._start(next);
  }

  _start(item) {
    ensureDir(this.logDir);
    const logPath = path.join(this.logDir, `queue-${item.id}.log`);
    const child = spawn(process.execPath, item.argv, { cwd: this.rootDir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    item.status = 'running';
    item.started_at = new Date().toISOString();
    item.pid = child.pid;
    item.log_path = path.relative(this.rootDir, logPath);
    this.children.set(item.id, child);
    this._persist();
    child.on('close', (code) => {
      this.children.delete(item.id);
      // A cancelled item was already marked; do not overwrite it.
      if (item.status === 'running') {
        item.status = code === 0 ? 'done' : 'failed';
        item.exit_code = code;
        item.ended_at = new Date().toISOString();
        if (code !== 0) item.error = `Run exited with code ${code}.`;
      }
      this._persist();
      this._tick();
    });
  }

  cancel(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) throw new Error(`No queue item ${id}.`);
    if (item.status === 'pending') {
      item.status = 'cancelled';
      item.ended_at = new Date().toISOString();
      this._persist();
      return { id, status: 'cancelled' };
    }
    if (item.status === 'running') {
      const child = this.children.get(id);
      item.status = 'cancelled';
      item.ended_at = new Date().toISOString();
      item.error = 'Cancelled by operator.';
      if (child) child.kill('SIGTERM');
      this.children.delete(id);
      this._persist();
      this._tick();
      return { id, status: 'cancelled' };
    }
    return { id, status: item.status, note: 'Already finished; nothing to cancel.' };
  }

  clearPending() {
    let removed = 0;
    for (const item of this.items) {
      if (item.status === 'pending') {
        item.status = 'cancelled';
        item.ended_at = new Date().toISOString();
        removed += 1;
      }
    }
    this._persist();
    return { cancelled: removed };
  }

  list() {
    const running = this.items.find((item) => item.status === 'running') || null;
    const pending = this.items.filter((item) => item.status === 'pending');
    const recent = this.items
      .filter((item) => ['done', 'failed', 'cancelled', 'interrupted'].includes(item.status))
      .slice(-8)
      .reverse();
    const view = (item) => item && { id: item.id, kind: item.kind, label: item.label, status: item.status, enqueued_at: item.enqueued_at, started_at: item.started_at, ended_at: item.ended_at, log_path: item.log_path, error: item.error };
    return {
      running: view(running),
      pending: pending.map(view),
      recent: recent.map(view),
      counts: { pending: pending.length, running: running ? 1 : 0 }
    };
  }
}
