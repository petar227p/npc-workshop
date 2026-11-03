// Product introduction only: the preview is illustrative, and neither destination is loaded here.
import { RoleLogo } from './RoleLogo';

export function Entrance() {
  return (
    <div className="entrance">
      <section className="entrance-hero" aria-labelledby="entrance-heading">
        <div className="entrance-intro">
          <div className="entrance-heading-group">
            <img className="entrance-brand" src="/brand/npc-workshop-logo.png" alt="NPC Workshop" width="600" height="336" />
            <h1 id="entrance-heading">Bring your NPCs to life.<br /><span>Keep your game in control.</span></h1>
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
          <figcaption id="entrance-preview-caption"><span>Inside the workshop</span><span>Illustrative example · not live</span></figcaption>
          <div className="entrance-config">
            <p className="entrance-preview-label">Character configuration</p>
            <div className="entrance-character"><RoleLogo role="merchant" /><div><h2>Rowan</h2><span>Merchant · a patient negotiator</span></div></div>
            <dl>
              <div><dt>Personality</dt><dd>Patient, practical, enjoys bargaining</dd></div>
              <div><dt>Abilities</dt><dd><span className="entrance-ability">Sell stocked goods</span><span className="entrance-ability">Refuse a deal</span></dd></div>
              <div><dt>Limits</dt><dd>Torch · minimum price 3 gold</dd></div>
            </dl>
          </div>
          <div className="entrance-test">
            <p className="entrance-preview-label">Isolated test session</p>
            <p className="entrance-proposal"><span>Model proposes</span>Sell a torch for 1 gold.</p>
            <p className="entrance-verdict"><b>× &nbsp; Code check: rejected</b><span>Price is below the configured minimum.</span></p>
          </div>
        </figure>
      </section>

      <ol className="entrance-steps" aria-label="How NPC Workshop works">
        <li><span aria-hidden="true">1</span><div><h2>Create a character</h2><p>Give it a role, a voice, and a personality.</p></div></li>
        <li><span aria-hidden="true">2</span><div><h2>Set the ground rules</h2><p>Choose its abilities, stock, and limits.</p></div></li>
        <li><span aria-hidden="true">3</span><div><h2>Put it to the test</h2><p>Try a conversation. Inspect what happens.</p></div></li>
      </ol>

      <section className="entrance-example" aria-labelledby="entrance-example-heading">
        <div className="entrance-example-art" aria-hidden="true">
          <RoleLogo role="smith" />
        </div>
        <div className="entrance-example-copy">
          <p className="entrance-eyebrow">Made in NPC Workshop</p>
          <h2 id="entrance-example-heading">Meet Brann. Try striking a deal.</h2>
          <p>
            Visit Brann&apos;s workshop in the example village. Bargain for an order, accept an offer checked by code, and collect the item when its making time is up.
          </p>
          <a className="entrance-demo-link" href="#/village">Open demo in the example village <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <footer className="entrance-footer">
        <a href="https://github.com/petar227p/npc-workshop">GitHub</a>
        <a href="https://github.com/petar227p/npc-workshop/blob/main/docs/api.md">API docs</a>
      </footer>
    </div>
  );
}
