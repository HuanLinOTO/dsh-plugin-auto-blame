//#region src/invariant.ts
const PACKAGE_NAME = "@huanlin/dsh-plugin-auto-blame";
/** Cordis companion plugin name. */
const name = "dsh-auto-blame-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the single `agent/turn-stopping` listener is a
* cordis-owned effect whose disposal is proven by the HMR-safety spec, and
* the `autoBlame` projection unit is registry-owned. Neither emits
* cross-plugin mutable state outside the session log's own durability
* contract.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
