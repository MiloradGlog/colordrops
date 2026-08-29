// Universal ads interface. In the browser this is a stub: interstitials
// no-op and rewarded grants instantly (the web build ships ad-free, so the
// reward must not be gated). The Expo/AdMob implementation replaces `ads`
// behind this same interface at ship time — flows already handle a refusal
// (user closed the ad early), so wiring the real SDK changes nothing here.
// Placement rules live in the game-universals skill — enforce them in the
// scene flow, not here.

export interface Ads {
  /** Natural-break interstitial. Resolves when dismissed (or immediately in dev). */
  interstitial(): Promise<void>;
  /** Rewarded ad. Resolves true only if the reward was earned. */
  rewarded(reason: string): Promise<boolean>;
}

export const ads: Ads = {
  async interstitial() {
    console.debug("[ads] interstitial slot");
  },
  async rewarded(reason) {
    console.debug(`[ads] rewarded slot: ${reason} (granted)`);
    return true; // browser build: no ad inventory, reward flows stay usable
  },
};
