// Product introduction only: the preview is illustrative, and neither destination is loaded here.

// A Tiny Dungeon character frame at 3x, as in the chat's portrait.
const frame = (n: number) => ({ backgroundPosition: `-${(n % 12) * 48}px -${Math.floor(n / 12) * 48}px` });

export function Entrance() {
  return (
    <div className="entrance">
      <section className="entrance-hero" aria-labelledby="entrance-heading">
        <div className="entrance-intro">
          <div className="entrance-heading-group">
            <img className="entrance-brand" src="/brand/npc-workshop-logo.png" alt="NPC Workshop" width="600" height="336" />
            <h1 id="entrance-heading">Build NPCs that act within your game&apos;s rules.</h1>
          </div>
          <p className="entrance-description">
            Define a character, choose its supported abilities, and test how it responds. The model proposes actions; code checks what can happen.
          </p>
          <div className="entrance-actions">
            <a className="entrance-build" href="#/workshop">Build an NPC <span aria-hidden="true">→</span></a>
            <a className="entrance-demo-link" href="#/village">Try the blacksmith demo <span aria-hidden="true">→</span></a>
          </div>
        </div>
        <figure className="entrance-preview" aria-labelledby="entrance-preview-caption">
          <figcaption id="entrance-preview-caption">Illustrative configuration and test · no live results</figcaption>
          <div className="entrance-config">
            <p className="entrance-preview-label">Character configuration</p>
            <h2>Rowan <span>Merchant</span></h2>
            <dl>
              <div><dt>Personality</dt><dd>Patient, practical, enjoys bargaining</dd></div>
              <div><dt>Abilities</dt><dd>Offer stocked goods · refuse a deal</dd></div>
              <div><dt>Limits</dt><dd>Torch · minimum price 3 gold</dd></div>
            </dl>
          </div>
          <div className="entrance-test">
            <p className="entrance-preview-label">Isolated test session</p>
            <p>Example proposal: sell a torch for 1 gold.</p>
            <p className="entrance-verdict"><b>Code check: rejected</b><span>Price is below the configured minimum.</span></p>
          </div>
        </figure>
      </section>

      <ol className="entrance-steps" aria-label="How NPC Workshop works">
        <li><span aria-hidden="true">01</span>Create a character</li>
        <li><span aria-hidden="true">02</span>Configure abilities and limits</li>
        <li><span aria-hidden="true">03</span>Test conversations and actions</li>
      </ol>

      <section className="entrance-example" aria-labelledby="entrance-example-heading">
        <div className="entrance-example-art" aria-hidden="true">
          <span className="portrait" style={frame(86)} />
        </div>
        <div className="entrance-example-copy">
          <h2 id="entrance-example-heading">Brann the blacksmith — a playable NPC Workshop demo.</h2>
          <p>
            Visit Brann&apos;s workshop in the example village. Bargain for an order, accept an offer checked by code, and collect the item when its making time is up.
          </p>
          <a className="entrance-demo-link" href="#/village">Open demo in the example village <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </div>
  );
}
