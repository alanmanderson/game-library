// screen-board.jsx — Main Game Screen + per-phase variants.
//
// Provides:
//   GameScreen({ variant, pawnKind })  — full desktop layout
// variant: 'idle' | 'move' | 'shore' | 'give' | 'capture' | 'pilot_fly' |
//          'diver_path' | 'explorer_diag' | 'draw_treasure' | 'draw_flood'
//          | 'navigator_select' | 'helilift_target' | 'sandbags_target'
//
// Each variant tweaks targets[] / overlays / actionbar state and
// optionally renders a centered "card reveal" or "instruction" overlay.

// Build the standard pawn map (we keep the sample arrangement consistent
// across screenshots so the engineer can see the same board state).
function buildPawnMap({ pawnKind='portrait', isYourTurn=true, occupants=null }={}) {
  // default occupants (matches role.startTile or chosen position per variant)
  const occ = occupants || {
    fools_landing:  ['pilot'],
    bronze_gate:    ['engineer'],
    copper_gate:    ['explorer'],
    gold_gate:      ['navigator'],
    iron_gate:      ['diver'],
    silver_gate:    ['messenger'],
  };
  const out = {};
  Object.entries(occ).forEach(([tile, roles])=>{
    out[tile] = roles.map((r,i)=>(
      <Pawn key={r+i} role={r} kind={pawnKind} size={28}
        isActive={isYourTurn && r==='pilot'} />
    ));
  });
  return out;
}

// Common state used by all variants (4-player Normal game, mid-game-ish)
const BASE_TILE_STATE = {
  // already flooded
  cliffs_abandon:'flooded',
  whispering_garden:'flooded',
  observatory:'flooded',
  misty_marsh:'flooded',
  twilight_hollow:'flooded',
  // sunk
  phantom_rock:'sunk',
};

const BASE_PLAYERS = [
  { name:'Camille', role:'pilot',     isYou:true,  isActive:true,  handCount:3 },
  { name:'Wren',    role:'engineer',  isActive:false,handCount:4 },
  { name:'Tomás',   role:'navigator', isActive:false,handCount:5 },
  { name:'Jules',   role:'diver',     isActive:false,handCount:2 },
];

const BASE_HAND = [
  { type:'earth_stone' },
  { type:'crystal_of_fire' },
  { type:'sandbags' },
];

const BASE_LOG = [
  { turn:8, text:'Phantom Rock has sunk.', tone:'danger' },
  { turn:8, text:'Waters Rise! Water level now 4.', tone:'danger' },
  { turn:7, text:'Tomás captured the Earth Stone.', tone:'good' },
  { turn:7, text:'Wren shored up Misty Marsh.' },
  { turn:6, text:'Jules moved to Iron Gate.' },
];

// ─── per-variant overlays / state ───────────────────────────────────────
function variantConfig(variant) {
  const cfg = {
    targets: {}, overlay: null, hint: { capture:false },
    available: { move:true, shore:true, give:false, capture:false, end:true },
    activeMode: null,
    handHighlight: null,
    selectedTile: null,
  };
  if (variant === 'idle' || variant == null) {
    cfg.available = { move:true, shore:true, give:false, capture:false, end:true };
  }
  if (variant === 'move') {
    cfg.activeMode = 'move';
    cfg.targets = { lost_lagoon:'move', cave_embers:'move', misty_marsh:'move' };
    cfg.selectedTile = 'fools_landing';
  }
  if (variant === 'shore') {
    cfg.activeMode = 'shore';
    cfg.targets = { cliffs_abandon:'shore', misty_marsh:'shore', observatory:'shore', whispering_garden:'shore' };
  }
  if (variant === 'give') {
    cfg.activeMode = 'give';
    cfg.available.give = true;
    cfg.handHighlight = 0;
    cfg.targets = { copper_gate:'give' };
  }
  if (variant === 'capture') {
    cfg.activeMode = 'capture';
    cfg.available.capture = true;
    cfg.hint.capture = true;
    cfg.overlay = { kind:'capture_prompt' };
  }
  if (variant === 'pilot_fly') {
    cfg.activeMode = 'move';
    // pilot flies to any non-sunk tile — show several
    cfg.targets = Object.fromEntries(TILES.filter(t=>t.id!=='phantom_rock').slice(0,18).map(t=>[t.id,'fly']));
  }
  if (variant === 'diver_path') {
    cfg.activeMode = 'move';
    cfg.targets = { cave_embers:'swim', cave_shadows:'swim', tidal_palace:'swim' };
    cfg.overlay = { kind:'tooltip', text:'Diver — slip through flooded and sunk tiles to reach any tile beyond.' };
  }
  if (variant === 'explorer_diag') {
    cfg.activeMode = 'move';
    cfg.targets = { breakers_bridge:'move', dunes_deception:'move', crimson_forest:'move' };
    cfg.overlay = { kind:'tooltip', text:'Explorer — move and shore up diagonally.' };
  }
  if (variant === 'navigator_select') {
    cfg.activeMode = 'give'; // borrow tone
    cfg.overlay = { kind:'tooltip', text:'Navigator — pick a crew-mate to move up to 2 tiles.' };
    cfg.targets = { dunes_deception:'move', observatory:'move' };
  }
  if (variant === 'helilift_target') {
    cfg.overlay = { kind:'helilift' };
    cfg.targets = Object.fromEntries(TILES.filter(t=>t.id!=='phantom_rock').map(t=>[t.id,'fly']));
  }
  if (variant === 'sandbags_target') {
    cfg.overlay = { kind:'sandbags' };
    cfg.targets = { cliffs_abandon:'shore', misty_marsh:'shore', observatory:'shore', whispering_garden:'shore', twilight_hollow:'shore' };
  }
  return cfg;
}

// ─── Main GameScreen ────────────────────────────────────────────────────
function GameScreen({
  width=1440, height=900,
  variant='idle',
  pawnKind='portrait',
  waterLevel=4,
  capturedTreasures=['earth_stone'],
  showOverlay=true,
  style,
}) {
  const cfg = variantConfig(variant);
  const pawns = buildPawnMap({ pawnKind, isYourTurn:true });
  // adjust active pawn for variants
  if (variant === 'navigator_select') {
    pawns.gold_gate = [
      <Pawn key="nav" role="navigator" kind={pawnKind} size={28} isActive/>
    ];
  }
  if (variant === 'diver_path') {
    pawns.iron_gate = [<Pawn key="d" role="diver" kind={pawnKind} size={28} isActive/>];
  }
  if (variant === 'explorer_diag') {
    pawns.copper_gate = [<Pawn key="e" role="explorer" kind={pawnKind} size={28} isActive/>];
  }

  const phase = (variant === 'draw_treasure') ? 'draw_treasure'
              : (variant === 'draw_flood') ? 'draw_flood'
              : 'action';

  return (
    <ScreenBg style={{width, height, ...style}}>
      <div style={{
        position:'relative', zIndex:1,
        display:'grid',
        gridTemplateColumns:'280px 1fr 320px',
        gridTemplateRows: 'auto 1fr auto',
        gridTemplateAreas: `"left  top    right"
                            "left  board  right"
                            "left  action right"`,
        gap: 16, padding: 16, height: '100%', boxSizing:'border-box',
      }}>
        {/* TOP BAR (turn indicator) */}
        <div style={{gridArea:'top', display:'flex', gap:10, alignItems:'center'}}>
          <BrandMark size="sm"/>
          <div style={{flex:1}}/>
          <TurnIndicator
            currentPlayer={BASE_PLAYERS.find(p=>p.isActive).name}
            role={BASE_PLAYERS.find(p=>p.isActive).role}
            actionsRemaining={variant==='draw_treasure'||variant==='draw_flood'?0:2}
            isYou
            phase={phase}
          />
        </div>

        {/* LEFT SIDEBAR (players, treasures, water) */}
        <div style={{gridArea:'left', display:'flex', flexDirection:'column', gap:14, overflow:'hidden'}}>
          <Frame tone="ink2" padded={false} style={{padding:14}}>
            <div className="fi-cap" style={{marginBottom:8}}>Crew · 4 aboard</div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {BASE_PLAYERS.map(p=>(
                <PlayerInfo key={p.name} {...p} pawnKind={pawnKind}/>
              ))}
            </div>
          </Frame>
          <Frame tone="ink2" padded={false} style={{padding:14}}>
            <TreasureTracker captured={capturedTreasures} layout="column"/>
          </Frame>
          <Frame tone="ink2" padded={false} style={{padding:14, display:'flex', justifyContent:'center'}}>
            <WaterMeter level={waterLevel} compact/>
          </Frame>
        </div>

        {/* BOARD */}
        <div style={{gridArea:'board', position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
          {/* ocean ripples */}
          <div aria-hidden style={{position:'absolute', inset:0,
            background:`radial-gradient(60% 60% at 50% 50%, rgba(58,151,168,.12) 0%, transparent 70%)`}}/>
          <IslandGrid
            tileSize={108}
            gap={9}
            states={BASE_TILE_STATE}
            targets={cfg.targets}
            selected={cfg.selectedTile}
            captured={capturedTreasures}
            dangerTiles={['observatory']}
            pawnsOnTile={pawns}
          />
          {/* center overlay */}
          {showOverlay && cfg.overlay && <CenterOverlay overlay={cfg.overlay} pawnKind={pawnKind}/>}
          {variant === 'draw_treasure' && <DrawTreasureReveal/>}
          {variant === 'draw_flood' && <DrawFloodReveal/>}
        </div>

        {/* RIGHT SIDEBAR (hand, decks, log) */}
        <div style={{gridArea:'right', display:'flex', flexDirection:'column', gap:14, overflow:'hidden'}}>
          <Frame tone="ink2" padded={false} style={{padding:14}}>
            <div className="fi-cap" style={{marginBottom:10}}>Your Hand · {BASE_HAND.length} / 5</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              {BASE_HAND.map((h,i)=>(
                <div key={i} style={{
                  transform: cfg.handHighlight===i?'translateY(-6px)':'none',
                  transition:'transform .2s',
                }}>
                  <TreasureCard type={h.type} width={84} height={120}
                    glow={cfg.handHighlight===i}/>
                </div>
              ))}
            </div>
          </Frame>
          <Frame tone="ink2" padded={false} style={{padding:14}}>
            <div className="fi-cap" style={{marginBottom:10}}>Decks</div>
            <div style={{display:'flex', gap:18, justifyContent:'space-around'}}>
              <DeckStack count={16} width={66} height={94} label="Treasure"/>
              <DeckStack count={11} width={66} height={94} label="Flood" tone="flood"/>
            </div>
          </Frame>
          <Frame tone="ink2" padded={false} style={{padding:14, flex:1, minHeight:0}}>
            <GameLog entries={BASE_LOG}/>
          </Frame>
        </div>

        {/* ACTION BAR */}
        <div style={{gridArea:'action'}}>
          <ActionBar
            available={cfg.available}
            hint={cfg.hint}
            activeMode={cfg.activeMode}
          />
        </div>
      </div>
    </ScreenBg>
  );
}

// ─── Centered overlay (instruction / decision modal) ────────────────────
function CenterOverlay({ overlay, pawnKind='portrait' }) {
  const c = overlay;
  if (c.kind === 'tooltip') {
    return (
      <div style={{position:'absolute', top:18, left:'50%', transform:'translateX(-50%)',
        padding:'10px 16px', borderRadius:10,
        background:'rgba(8,22,28,.85)', border:'1px solid var(--c-brassHi)',
        boxShadow:'0 0 24px rgba(232,196,122,.3)',
        fontFamily:'var(--ff-display)', fontStyle:'italic', fontSize:14, color:'var(--c-brassHi)',
        backdropFilter:'blur(8px)'
      }}>{c.text}</div>
    );
  }
  if (c.kind === 'capture_prompt') {
    return (
      <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none'}}>
        <div style={{
          background:'rgba(8,22,28,.92)', backdropFilter:'blur(6px)',
          border:'1px solid var(--c-brassHi)', borderRadius:14,
          padding:'18px 22px', textAlign:'center',
          boxShadow:'0 0 40px rgba(232,196,122,.4)',
        }}>
          <div className="fi-cap" style={{color:'var(--c-brassHi)'}}>Treasure Within Reach</div>
          <div className="fi-display" style={{fontSize:24,color:'var(--c-parch)',marginTop:6}}>Capture the <span className="fi-display-i">Crystal of Fire</span>?</div>
          <div style={{display:'flex', gap:8, marginTop:14, justifyContent:'center'}}>
            {[1,2,3,4].map(i=>(
              <TreasureCard key={i} type="crystal_of_fire" width={60} height={86} glow/>
            ))}
          </div>
          <div style={{display:'flex',gap:10,marginTop:14, justifyContent:'center',pointerEvents:'auto'}}>
            <Btn kind="ghost" size="sm">Not Yet</Btn>
            <Btn kind="primary" size="md" glow>Capture →</Btn>
          </div>
        </div>
      </div>
    );
  }
  if (c.kind === 'helilift') {
    return (
      <div style={{position:'absolute', top:18, left:'50%', transform:'translateX(-50%)',
        padding:'10px 16px', borderRadius:10,
        background:'rgba(8,22,28,.9)', border:'1px solid var(--c-seaHi)',
        fontFamily:'var(--ff-display)', fontStyle:'italic', fontSize:14, color:'var(--c-seaHi)',
        boxShadow:'0 0 28px rgba(58,151,168,.3)',
      }}>Helicopter Lift — choose a destination for the selected crew.</div>
    );
  }
  if (c.kind === 'sandbags') {
    return (
      <div style={{position:'absolute', top:18, left:'50%', transform:'translateX(-50%)',
        padding:'10px 16px', borderRadius:10,
        background:'rgba(8,22,28,.9)', border:'1px solid var(--c-brassHi)',
        fontFamily:'var(--ff-display)', fontStyle:'italic', fontSize:14, color:'var(--c-brassHi)',
      }}>Sandbags — shore up any flooded tile on the island.</div>
    );
  }
  return null;
}

// ─── Draw phases ────────────────────────────────────────────────────────
function DrawTreasureReveal() {
  return (
    <div style={{position:'absolute', inset:0, display:'flex',alignItems:'center',justifyContent:'center', pointerEvents:'none'}}>
      <div style={{position:'absolute', inset:0, background:'rgba(8,22,28,.55)', backdropFilter:'blur(2px)'}}/>
      <div style={{position:'relative', textAlign:'center'}}>
        <div className="fi-cap" style={{color:'var(--c-brassHi)'}}>Draw 2 Treasure Cards</div>
        <div className="fi-display" style={{fontSize:26, color:'var(--c-parch)', marginTop:4}}>Drawing from the deck…</div>
        <div style={{display:'flex', gap:18, marginTop:18, alignItems:'center', justifyContent:'center'}}>
          <CardBack width={120} height={170}/>
          <div style={{display:'flex', gap:14}}>
            <div style={{transform:'translateY(-8px) rotate(-4deg)'}}>
              <TreasureCard type="oceans_chalice" width={120} height={170} glow/>
            </div>
            <div style={{transform:'rotate(3deg)'}}>
              <TreasureCard type="helicopter_lift" width={120} height={170} glow/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawFloodReveal() {
  return (
    <div style={{position:'absolute', inset:0, display:'flex',alignItems:'center',justifyContent:'center', pointerEvents:'none'}}>
      <div style={{position:'absolute', inset:0, background:'rgba(8,22,28,.55)', backdropFilter:'blur(2px)'}}/>
      <div style={{position:'relative', textAlign:'center'}}>
        <div className="fi-cap" style={{color:'var(--c-seaHi)'}}>Draw 3 Flood Cards</div>
        <div className="fi-display" style={{fontSize:26, color:'var(--c-parch)', marginTop:4}}>The tide rises…</div>
        <div style={{display:'flex', gap:14, marginTop:18, alignItems:'center', justifyContent:'center'}}>
          <FloodCard tileId="dunes_deception" width={110} height={150}/>
          <FloodCard tileId="lost_lagoon" width={110} height={150} glow/>
          <FloodCard tileId="observatory" width={110} height={150} sunk glow/>
        </div>
        <div className="fi-mono" style={{marginTop:10, fontSize:10, color:'var(--c-danger)', letterSpacing:'.15em'}}>
          OBSERVATORY WAS ALREADY FLOODED — IT SINKS
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { buildPawnMap, BASE_TILE_STATE, BASE_PLAYERS, BASE_HAND, BASE_LOG, variantConfig, GameScreen, CenterOverlay, DrawTreasureReveal, DrawFloodReveal });
