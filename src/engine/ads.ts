// Universal ads interface. No-op in dev/browser; the Capacitor+AdMob
// implementation replaces `ads` at ship stage behind the same interface.
// Placement rules live in the game-universals skill — enforce them in the
// scene flow, not here.

export interface Ads {
  /** Natural-break interstitial. Resolves when dismissed (or immediately in dev). */
  interstitial(): Promise<void>;
  /** Optional rewarded ad. Resolves true only if the reward was earned. */
  rewarded(reason: string): Promise<boolean>;
}

export const ads: Ads = {
  async interstitial() {
    console.debug("[ads] interstitial slot");
  },
  async rewarded(reason) {
    console.debug(`[ads] rewarded slot: ${reason}`);
    return false; // dev default: no reward, so flows must handle refusal
  },
};
