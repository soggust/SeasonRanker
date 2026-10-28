// Publishing the analysis folders onto origin/master from a checkout of their own (2026-10-27: the runners committed in
// the main checkout first, and a commit there collided with other work in it: "commit failed", the week's NHL and MLB
// reports never pushed). The main checkout's index is never touched: the folders are copied into a fresh worktree of
// origin/master, committed and pushed there, and tried again when someone pushed in between.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

// { root (the main checkout), tree (the worktree's folder), dirs (relative to root), message, log, tries }: true once
// pushed (or nothing changed), false when it couldn't
export function publishDirs({ root, tree, dirs, message, log = console.log, tries = 4 }) {
  const git = (args, cwd = root) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? ` (${r.error.message})` : ''}${r.status !== 0 && !r.error ? ` (exit ${r.status})` : ''}`.trim() };
  };
  const clean = () => {
    if (existsSync(tree)) git(['worktree', 'remove', '--force', tree]);
    rmSync(tree, { recursive: true, force: true });
    git(['worktree', 'prune']);
  };
  for (let attempt = 1; attempt <= tries; attempt++) {
    git(['fetch', 'origin', 'master']);
    clean();
    const added = git(['worktree', 'add', '--detach', tree, 'origin/master']);
    if (!added.ok) {
      log(`worktree failed: ${added.out}`);
      break;
    }
    for (const d of dirs) {
      const to = path.join(tree, d);
      rmSync(to, { recursive: true, force: true });
      cpSync(path.join(root, d), to, { recursive: true });
    }
    git(['add', '-A', '--', ...dirs], tree);
    if (git(['diff', '--cached', '--quiet', '--', ...dirs], tree).ok) {
      log('no analysis changes to push');
      clean();
      return true;
    }
    const committed = git(['commit', '-m', message], tree);
    if (!committed.ok) {
      log(`commit failed: ${committed.out}`);
      break;
    }
    const pushed = git(['push', 'origin', 'HEAD:master'], tree);
    if (pushed.ok) {
      log('pushed to master');
      clean();
      return true;
    }
    log(`push rejected (try ${attempt}): ${pushed.out.split('\n').at(-1)}`);
  }
  clean();
  log("couldn't push; the reports are in the main checkout (push them by hand)");
  return false;
}
