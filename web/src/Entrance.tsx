// The way in: two destinations, nothing else. Neither choice loads the village or calls a model until it's picked.

// A Tiny Dungeon character frame at 3x, as in the chat's portrait.
const frame = (n: number) => ({ backgroundPosition: `-${(n % 12) * 48}px -${Math.floor(n / 12) * 48}px` });

// Villagers' own sprites (npcs/*.json): smith, merchant, cottager, farmer, guard.
const VILLAGERS = [86, 99, 98, 88, 96];

export function Entrance() {
  return (
    <div className="entrance">
      <div className="entrance-intro">
        <h1>NPC Workshop</h1>
        <p>Meet characters who can think for themselves, inside rules you define.</p>
      </div>
      <div className="entrance-choices">
        <a className="entry" href="#/village">
          <div className="entry-preview village-preview" aria-hidden="true">
            {VILLAGERS.map((n) => (
              <span key={n} className="portrait" style={frame(n)} />
            ))}
          </div>
          <h2>Explore the village</h2>
          <p>Meet the villagers, negotiate a deal, and watch word spread.</p>
          <span className="entry-go">Enter village</span>
        </a>
        <a className="entry" href="#/workshop">
          <div className="entry-preview workshop-preview" aria-hidden="true">
            <span className="portrait" style={frame(86)} />
            <ul>
              <li>
                <b>Personality</b> gruff, proud of his work
              </li>
              <li>
                <b>Actions</b> offer · refuse · tell
              </li>
              <li>
                <b>Rules</b> never below the floor price
              </li>
            </ul>
          </div>
          <h2>Build an NPC</h2>
          <p>Shape a character’s personality, actions, and rules—then test it.</p>
          <span className="entry-go">Open workshop</span>
        </a>
      </div>
    </div>
  );
}
