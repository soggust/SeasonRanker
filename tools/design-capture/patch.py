# Capture-only patch: lets a page run signed in with fixture data (window.__SR_FIXTURE). Never committed.
# Usage: python3 patch.py <repo root>   (undo with: git checkout -- libs/ranker/src/engine/account)
import sys,os
R=os.path.join(sys.argv[1] if len(sys.argv)>1 else '.','libs/ranker/src/engine/account')+'/'
p=R+'account.service.ts'; s=open(p).read()
s=s.replace("  constructor() {\n    // (a returning visitor: restore their sign-in now)\n",
"  constructor() {\n    const fx = (globalThis as any).__SR_FIXTURE;\n    if (fx) { this.current.set(fx.user); this.known.set(true); this.adminKnown.set(true); ADMIN.set(!!fx.user.admin); return; }\n    // (a returning visitor: restore their sign-in now)\n",1)
assert '__SR_FIXTURE' in s; open(p,'w').write(s)
p=R+'wallet/wallet.service.ts'; s=open(p).read()
s=s.replace("    if (!uid) return;\n    const [firestore, f] = await firestoreSdk();\n    if (this.uid !== uid) return;\n    this.stop.push(",
"    if (!uid) return;\n    const fx = (globalThis as any).__SR_FIXTURE;\n    if (fx) { this.wallet.set(fx.wallet); this.openBets.set(fx.open); this.settledBets.set(fx.settled); this.hasSettled.set(fx.settled.length > 0); this.settledState.set('all'); this.tally.set(fx.tally ? tallyFrom(fx.tally) : null); this.loaded.set(true); return; }\n    const [firestore, f] = await firestoreSdk();\n    if (this.uid !== uid) return;\n    this.stop.push(",1)
s=s.replace("    const uid = this.uid;\n    const state = this.settledState();","    if ((globalThis as any).__SR_FIXTURE) return;\n    const uid = this.uid;\n    const state = this.settledState();",1)
assert s.count('__SR_FIXTURE')==2; open(p,'w').write(s)
print('patched')
