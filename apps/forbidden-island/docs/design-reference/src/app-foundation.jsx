// app.jsx — Top-level composition: DesignCanvas + every section + Tweaks.
//
// EDITMODE-BEGIN markers below are read/written by the host. Keep the JSON
// strictly valid (double-quoted keys/strings).

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "ocean",
  "pawnKind": "portrait"
}/*EDITMODE-END*/;

// ─── Section header (in-artboard) ───────────────────────────────────────
function PageHead({ kicker, title, sub }) {
  return (
    <div style={{padding:'24px 32px 16px', background:'rgba(8,22,28,.55)', borderBottom:'1px solid rgba(202,160,82,.18)'}}>
      <div className="fi-mono" style={{fontSize:10, letterSpacing:'.24em', color:'var(--c-brass)'}}>{kicker}</div>
      <div className="fi-display" style={{fontSize:30, color:'var(--c-parch)', marginTop:4, letterSpacing:'-.01em'}}>{title}</div>
      {sub && <div style={{fontSize:13, color:'var(--c-sand2)', marginTop:6, maxWidth:720, lineHeight:1.5}}>{sub}</div>}
    </div>
  );
}

// ─── Stage wrapper: a full-width artboard with palette applied ──────────
function Stage({ width=1200, height=800, palette='ocean', children, style }) {
  return (
    <ThemeProvider paletteKey={palette}>
      <div style={{width, height, position:'relative', overflow:'hidden',
        background:'var(--c-ink)', color:'var(--c-parch)', fontFamily:'var(--ff-ui)', ...style}}>
        {children}
      </div>
    </ThemeProvider>
  );
}

// ─── Foundations / type / colors ────────────────────────────────────────
function FoundationsBoard({ palette }) {
  return (
    <Stage width={1300} height={900} palette={palette}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <div style={{position:'relative', padding:'40px 48px', display:'grid', gap:24}}>
        <div style={{display:'flex',alignItems:'center', gap:24}}>
          <BrandMark size="lg"/>
          <div style={{flex:1}}/>
          <Pill tone="brass">Design System v1</Pill>
        </div>

        <Frame tone="ink2" padded={false} style={{padding:24}}>
          <SectionTitle kicker="01 · Typography" title="Three voices" sub="Spectral carries the journal voice. Work Sans does the work of the UI. JetBrains Mono is for engineer-side context (IDs, deck counts, sequences)."/>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:18}}>
            <TypeSample family="var(--ff-display)" label="Spectral · Display" sample="Forbidden Island" sub="400 / 500 — captions, titles, mood lines (often italic)"/>
            <TypeSample family="var(--ff-ui)" label="Work Sans · UI" sample="Move · Shore Up · Capture" sub="500 / 600 — buttons, labels, dense crew copy"/>
            <TypeSample family="var(--ff-mono)" label="JetBrains Mono · Caption" sample="LOBBY:SELECT_ROLE" sub="500 — sequences, codes, debug-y captions"/>
          </div>
        </Frame>

        <Frame tone="ink2" padded={false} style={{padding:24}}>
          <SectionTitle kicker="02 · Color" title="Deep ocean + warm sand" sub="Four palettes ship in the Tweaks panel. All share role colors. Tone keys are mapped semantically so every screen swaps by changing one variable."/>
          <PaletteGrid/>
        </Frame>

        <Frame tone="ink2" padded={false} style={{padding:24}}>
          <SectionTitle kicker="03 · Surfaces" title="Card, parch, brass"/>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:14}}>
            <SurfaceSample label="Ink (background)" tone="ink"/>
            <SurfaceSample label="Surface (Frame)" tone="ink2"/>
            <ParchSample/>
            <BrassSample/>
          </div>
        </Frame>

        <Frame tone="ink2" padded={false} style={{padding:24}}>
          <SectionTitle kicker="04 · Buttons & badges" title="Brass primary, ghost, danger"/>
          <div style={{display:'flex', gap:14, alignItems:'center', flexWrap:'wrap'}}>
            <Btn kind="primary">Create Game</Btn>
            <Btn kind="primary" glow>Capture →</Btn>
            <Btn kind="ghost">Cancel</Btn>
            <Btn kind="quiet">Skip Turn</Btn>
            <Btn kind="danger">Drown Player</Btn>
            <Btn kind="primary" size="lg" glow>Set Sail →</Btn>
            <Btn disabled>Disabled</Btn>
          </div>
          <div style={{display:'flex', gap:10, marginTop:18}}>
            <Pill tone="brass">Treasure</Pill>
            <Pill tone="sea">Drawing flood</Pill>
            <Pill tone="danger">SINKING</Pill>
            <Pill tone="sand">Captured</Pill>
          </div>
        </Frame>
      </div>
    </Stage>
  );
}

function TypeSample({ family, label, sample, sub }) {
  return (
    <div style={{padding:14, background:'rgba(8,22,28,.5)', borderRadius:10, border:'1px solid rgba(202,160,82,.15)'}}>
      <div className="fi-cap">{label}</div>
      <div style={{fontFamily: family, fontSize:30, color:'var(--c-parch)', marginTop:6, fontStyle:family.includes('display')?'italic':'normal', lineHeight:1.1}}>{sample}</div>
      <div style={{fontSize:11, color:'var(--c-sand2)', marginTop:8, lineHeight:1.4}}>{sub}</div>
      <div style={{marginTop:10, display:'flex', gap:6}}>
        {['Aa','Bb','Cc','1','2','3'].map(c=><span key={c} style={{fontFamily:family, fontSize:14, color:'var(--c-sand)', padding:'3px 7px', borderRadius:4, background:'rgba(202,160,82,.05)'}}>{c}</span>)}
      </div>
    </div>
  );
}

function PaletteGrid() {
  return (
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14}}>
      {PALETTE_KEYS.map(key=>{
        const p = PALETTES[key];
        const swatches = ['ink','ink2','sea','sea2','brass','brassHi','sand','sand2','parch','danger'];
        return (
          <div key={key} style={{padding:12, background:'rgba(8,22,28,.5)', borderRadius:10, border:'1px solid rgba(202,160,82,.15)'}}>
            <div className="fi-display" style={{fontSize:15, color:'var(--c-parch)'}}>{p.name}</div>
            <div className="fi-mono" style={{fontSize:9, color:'var(--c-sand2)', letterSpacing:'.1em'}}>palette={key}</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:4, marginTop:10}}>
              {swatches.map(k=>(
                <div key={k} title={`${k} · ${p[k]}`} style={{
                  aspectRatio:'1', borderRadius:5, background:p[k],
                  border:'1px solid rgba(0,0,0,.4)', boxShadow:'0 0 0 1px rgba(255,255,255,.06) inset',
                  display:'flex', alignItems:'flex-end', padding:3,
                }}>
                  <div className="fi-mono" style={{fontSize:7.5, color:'rgba(0,0,0,.55)', letterSpacing:'.04em', fontWeight:700}}>{k}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SurfaceSample({ label, tone }) {
  return (
    <Frame tone={tone} padded={false} style={{padding:14, minHeight:90}}>
      <div className="fi-cap">{label}</div>
      <div className="fi-display" style={{fontSize:16, color:'var(--c-parch)', marginTop:6}}>Lorem ipsum dolor sit</div>
      <div className="fi-mono" style={{fontSize:9, color:'var(--c-sand2)', marginTop:6, letterSpacing:'.1em'}}>tone={tone}</div>
    </Frame>
  );
}
function ParchSample() {
  return (
    <Parch>
      <div className="fi-cap" style={{color:'var(--c-brassLo)'}}>Parchment</div>
      <div className="fi-display" style={{fontSize:16, color:'var(--c-inkText)', marginTop:4}}>An old expedition log</div>
      <div className="fi-mono" style={{fontSize:9, color:'var(--c-inkText2)', marginTop:6, letterSpacing:'.1em'}}>used for cards & callouts</div>
    </Parch>
  );
}
function BrassSample() {
  return (
    <div style={{padding:14, borderRadius:14,
      background:'linear-gradient(180deg, var(--c-brassHi) 0%, var(--c-brass) 50%, var(--c-brassLo) 100%)',
      color:'var(--c-ink)', boxShadow:'var(--shadow-2)', minHeight:90}}>
      <div className="fi-mono" style={{fontSize:9, letterSpacing:'.14em'}}>BRASS · CTA</div>
      <div className="fi-display" style={{fontSize:16, marginTop:6}}>Capture Treasure</div>
      <div style={{fontSize:11, marginTop:6, opacity:.7}}>Used sparingly: turn callouts, capture glow, the helicopter.</div>
    </div>
  );
}

// ─── 24-tile catalog board ──────────────────────────────────────────────
function TilesCatalog({ palette }) {
  return (
    <Stage width={1300} height={1500} palette={palette}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <PageHead kicker="PIECES · 01 · ISLAND TILES"
        title="Twenty-four miniature paintings"
        sub="Each tile is a 1:1 atmospheric scene rendered with a tile-specific gradient ground, paper texture, and a simple iconographic glyph. The named scene is the engineer's slot — production swaps the glyph layer for painted artwork."/>
      <div style={{padding:'24px 32px'}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:14, justifyItems:'center'}}>
          {TILES.map(t=>(
            <div key={t.id} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:6}}>
              <Tile id={t.id} size={150}/>
              <div className="fi-mono" style={{fontSize:9, color:'var(--c-sand2)', letterSpacing:'.1em'}}>{t.id}</div>
            </div>
          ))}
        </div>
        <hr className="fi-hr" style={{margin:'28px 0 18px'}}/>
        <SectionTitle kicker="STATES" title="Normal · Flooded · Sunk" sub="Damage reads physically — flooded tiles tilt and crack lightly under a blue wash; sunk tiles become empty ocean cells with a brass-rimmed scar."/>
        <div style={{display:'flex', gap:48, justifyContent:'center', marginTop:10}}>
          {['normal','flooded','sunk'].map(st=>(
            <div key={st} style={{textAlign:'center'}}>
              <Tile id="temple_sun" state={st} size={180}/>
              <div className="fi-mono" style={{marginTop:10, fontSize:10, color:'var(--c-brass)', letterSpacing:'.12em'}}>STATE · {st.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>
    </Stage>
  );
}

// ─── Roles + pawn styles ────────────────────────────────────────────────
function RolesBoard({ palette, pawnKind }) {
  return (
    <Stage width={1300} height={1080} palette={palette}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <PageHead kicker="PIECES · 02 · ADVENTURERS"
        title="Six roles, four pawn styles"
        sub="Each adventurer carries a distinct color and ability. The pawn style is swappable in Tweaks — production ships portraits (default), with chess silhouettes, role badges, and gem variants available."/>
      <div style={{padding:'24px 32px', display:'grid', gap:24}}>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="ROLE CARDS" title="Lobby + sidebar" sub="The same card used in waiting-room role selection and the in-game player roster."/>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
            {ROLES.map(r=>(<RoleCard key={r.id} role={r.id} pawnKind={pawnKind}/>))}
          </div>
        </Frame>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="PAWN STYLES" title="Switch in Tweaks" sub="All four styles render the same role color and glyph — pick the metaphor that fits your audience."/>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
            {['portrait','chess','badge','gem'].map(k=>(
              <div key={k} style={{padding:14,background:'rgba(8,22,28,.45)',borderRadius:10,border:'1px solid rgba(202,160,82,.18)'}}>
                <div className="fi-cap">style={k}</div>
                <div style={{display:'flex', gap:10, marginTop:12, justifyContent:'center', alignItems:'flex-end'}}>
                  {ROLES.map(r=>(<Pawn key={r.id} role={r.id} kind={k} size={42}/>))}
                </div>
              </div>
            ))}
          </div>
        </Frame>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="PAWN STATES" title="Resting · Active · Disconnected"/>
          <div style={{display:'flex', gap:36, justifyContent:'center', marginTop:6}}>
            {['resting','active','disconnected'].map(s=>(
              <div key={s} style={{textAlign:'center'}}>
                <Pawn role="pilot" kind={pawnKind} size={64}
                  isActive={s==='active'} dim={s==='disconnected'}/>
                <div className="fi-mono" style={{marginTop:8, fontSize:9, color:'var(--c-brass)', letterSpacing:'.12em'}}>{s.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </Frame>
      </div>
    </Stage>
  );
}

// ─── Card catalog ───────────────────────────────────────────────────────
function CardsBoard({ palette }) {
  return (
    <Stage width={1300} height={1100} palette={palette}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <PageHead kicker="PIECES · 03 · CARDS"
        title="Treasure, special, flood"
        sub="Treasure deck composition: 5 of each treasure (20) + 3 Helicopter Lift + 2 Sandbags + 3 Waters Rise! = 28. Flood deck: one card per tile (24)."/>
      <div style={{padding:'24px 32px', display:'grid', gap:24}}>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="TREASURE CARDS · ×5 EACH" title="Four sacred treasures"/>
          <div style={{display:'flex', gap:14, justifyContent:'center'}}>
            <TreasureCardFace treasure="earth_stone" width={160} height={230}/>
            <TreasureCardFace treasure="statue_of_wind" width={160} height={230}/>
            <TreasureCardFace treasure="crystal_of_fire" width={160} height={230}/>
            <TreasureCardFace treasure="oceans_chalice" width={160} height={230}/>
          </div>
        </Frame>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="SPECIAL CARDS · PLAY ANY TIME" title="Heli, Sandbags, Hazard"/>
          <div style={{display:'flex', gap:14, justifyContent:'center'}}>
            <HelicopterLiftFace width={170} height={240}/>
            <SandbagsFace width={170} height={240}/>
            <WatersRiseFace width={170} height={240}/>
          </div>
        </Frame>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="FLOOD CARDS · ×24" title="One per tile" sub="Tile mini renders on each card so the reveal moment reads at a glance."/>
          <div style={{display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center'}}>
            {['fools_landing','temple_sun','cave_embers','tidal_palace','dunes_deception','observatory','watchtower'].map(id=>(
              <FloodCard key={id} tileId={id} width={120} height={170}/>
            ))}
          </div>
        </Frame>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="DECK STACKS · FACE-DOWN" title="The two draw piles"/>
          <div style={{display:'flex', gap:60, justifyContent:'center', marginTop:8}}>
            <div style={{textAlign:'center'}}>
              <DeckStack count={22} width={140} height={200} label="Treasure" sub="6 discarded"/>
              <div className="fi-mono" style={{marginTop:30, fontSize:10, color:'var(--c-sand2)', letterSpacing:'.12em'}}>treasureDeck.drawPile</div>
            </div>
            <div style={{textAlign:'center'}}>
              <DeckStack count={16} width={140} height={200} label="Flood" tone="flood" sub="8 in discard"/>
              <div className="fi-mono" style={{marginTop:30, fontSize:10, color:'var(--c-sand2)', letterSpacing:'.12em'}}>floodDeck.drawPile</div>
            </div>
          </div>
        </Frame>
      </div>
    </Stage>
  );
}

// ─── Status pieces (water meter, tracker, action bar, log) ──────────────
function StatusBoard({ palette, pawnKind }) {
  return (
    <Stage width={1300} height={1000} palette={palette}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <PageHead kicker="PIECES · 04 · STATUS & ACTIONS"
        title="The HUD"
        sub="Five components compose the in-game surround: turn indicator, water meter, treasure tracker, action bar, captain's log."/>
      <div style={{padding:'24px 32px', display:'grid', gap:20}}>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="WATER METER · 1–9" title="Vessel-style gauge"/>
          <div style={{display:'flex', gap:20, alignItems:'flex-end', justifyContent:'center'}}>
            {[1,2,3,4,6,8,9].map(lv=>(
              <div key={lv} style={{textAlign:'center'}}>
                <WaterMeter level={lv} compact/>
              </div>
            ))}
          </div>
        </Frame>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="TURN INDICATOR" title="Whose turn, what phase, how many actions"/>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <TurnIndicator currentPlayer="Camille" role="pilot" actionsRemaining={3} isYou phase="action"/>
            <TurnIndicator currentPlayer="Wren" role="engineer" actionsRemaining={1} isYou={false} phase="action"/>
            <TurnIndicator currentPlayer="Tomás" role="navigator" actionsRemaining={0} isYou={false} phase="draw_treasure"/>
            <TurnIndicator currentPlayer="Jules" role="diver" actionsRemaining={0} isYou={false} phase="draw_flood"/>
          </div>
        </Frame>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
          <Frame tone="ink2" padded={false} style={{padding:20}}>
            <TreasureTracker captured={['earth_stone','statue_of_wind']} layout="column"/>
          </Frame>
          <Frame tone="ink2" padded={false} style={{padding:20}}>
            <GameLog entries={BASE_LOG}/>
          </Frame>
        </div>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="ACTION BAR · 5 STATES" title="Default · Mode active · Disabled · Hint glow"/>
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            <ActionBar available={{move:true,shore:true,give:false,capture:false,end:true}}/>
            <ActionBar activeMode="move" available={{move:true,shore:true,give:false,capture:false,end:true}}/>
            <ActionBar available={{move:true,shore:true,give:true,capture:true,end:true}} hint={{capture:true}}/>
            <ActionBar available={{move:false,shore:false,give:false,capture:false,end:true}}/>
          </div>
        </Frame>
        <Frame tone="ink2" padded={false} style={{padding:20}}>
          <SectionTitle kicker="CREW ROSTER" title="One row per player"/>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {BASE_PLAYERS.map(p=>(<PlayerInfo key={p.name} {...p} pawnKind={pawnKind}/>))}
            <PlayerInfo name="Ines" role="messenger" handCount={6} isConnected={false} pawnKind={pawnKind}/>
          </div>
        </Frame>
      </div>
    </Stage>
  );
}

Object.assign(window, { TWEAK_DEFAULTS, PageHead, Stage, FoundationsBoard, TilesCatalog, RolesBoard, CardsBoard, StatusBoard });
