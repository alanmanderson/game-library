// app.jsx — DesignCanvas root + TweaksPanel + composition of all sections.

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const palette = t.palette || 'ocean';
  const pawnKind = t.pawnKind || 'portrait';

  return (
    <>
      <DesignCanvas>

        {/* ━━━━ FOUNDATIONS ━━━━ */}
        <DCSection id="foundations" title="Foundations" subtitle="Brand, type, color, surfaces — the design system every screen pulls from.">
          <DCArtboard id="brand" label="Identity · Type · Color · Surfaces" width={1300} height={900}>
            <FoundationsBoard palette={palette}/>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ GAME PIECES ━━━━ */}
        <DCSection id="pieces" title="Game Pieces" subtitle="Every primitive an engineer will render.">
          <DCArtboard id="tiles" label="24 Island Tiles · States" width={1300} height={1500}>
            <TilesCatalog palette={palette}/>
          </DCArtboard>
          <DCArtboard id="roles" label="Roles · Pawns · States" width={1300} height={1080}>
            <RolesBoard palette={palette} pawnKind={pawnKind}/>
          </DCArtboard>
          <DCArtboard id="cards" label="Treasure · Special · Flood · Decks" width={1300} height={1100}>
            <CardsBoard palette={palette}/>
          </DCArtboard>
          <DCArtboard id="status" label="Water · Turn · Tracker · Actions · Log" width={1300} height={1000}>
            <StatusBoard palette={palette} pawnKind={pawnKind}/>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ LOBBY FLOW ━━━━ */}
        <DCSection id="lobby" title="Lobby Flow" subtitle="Home → Create → Waiting Room → Joining.">
          <DCArtboard id="home" label="1 · Home / Game List" width={1200} height={820}>
            <ThemeProvider paletteKey={palette}><HomeScreen/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="create" label="2 · Create Game · Difficulty" width={1200} height={820}>
            <ThemeProvider paletteKey={palette}><CreateGameScreen/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="waiting" label="3 · Waiting Room · Role Select" width={1200} height={820}>
            <ThemeProvider paletteKey={palette}><WaitingRoom pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="join" label="4 · Join by Link · Name Prompt" width={600} height={380}>
            <ThemeProvider paletteKey={palette}>
              <ScreenBg style={{padding:20}}>
                <JoinByLink/>
              </ScreenBg>
            </ThemeProvider>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ SETUP ━━━━ */}
        <DCSection id="setup" title="Board Setup Animation" subtitle="The 5-step sequence between Start and the first turn. Each frame is ~1s.">
          {[1,2,3,4,5,6].map(f=>(
            <DCArtboard key={f} id={`setup-${f}`} label={`Frame ${f} of 6`} width={900} height={560}>
              <ThemeProvider paletteKey={palette}>
                <SetupFrame frame={f} pawnKind={pawnKind}/>
              </ThemeProvider>
            </DCArtboard>
          ))}
        </DCSection>

        {/* ━━━━ MAIN GAME — desktop variants ━━━━ */}
        <DCSection id="game" title="Game Screen · Phases" subtitle="Same 1440×900 layout. Each artboard captures a different turn-phase or action-mode state. Sidebar/right-pane/log all use the same components — only target highlights, overlays, and the active button differ.">
          <DCArtboard id="idle"  label="A · Action Phase · Idle" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="idle" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="move"  label="B · Move · Targets" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="move" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="shore" label="C · Shore Up · Targets" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="shore" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="give"  label="D · Give Card · Hand + Targets" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="give" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="capture" label="E · Capture Treasure · Prompt" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="capture" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="treas"  label="F · Draw Treasure · Reveal" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="draw_treasure" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="flood"  label="G · Draw Flood · Tile Sinks" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="draw_flood" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ ROLE ABILITIES ━━━━ */}
        <DCSection id="abilities" title="Role-Specific Actions" subtitle="Pilot fly, Diver pathfind, Explorer diagonal, Navigator move-other-player.">
          <DCArtboard id="pilot" label="Pilot · Fly to any tile" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="pilot_fly" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="diver" label="Diver · Through water" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="diver_path" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="explorer" label="Explorer · Diagonal" width={1440} height={900}>
            <ThemeProvider paletteKey={palette}><GameScreen variant="explorer_diag" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="navigator" label="Navigator · Move Another" width={900} height={560}>
            <ThemeProvider paletteKey={palette}><NavigatorFlow pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ SPECIAL CARDS ━━━━ */}
        <DCSection id="specials" title="Special Card Flows" subtitle="Helicopter Lift + Sandbags. Both playable any time, no action cost.">
          <DCArtboard id="heli" label="Helicopter Lift · pick crew → tile" width={900} height={560}>
            <ThemeProvider paletteKey={palette}><HelicopterLiftFlow pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="sand" label="Sandbags · any flooded tile" width={900} height={560}>
            <ThemeProvider paletteKey={palette}><SandbagsFlow pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ INTERRUPTS ━━━━ */}
        <DCSection id="interrupts" title="Interrupt Phases" subtitle="Hazards and limit-checks that pause normal flow.">
          <DCArtboard id="waters" label="Waters Rise! · Reveal + Resolution" width={900} height={560}>
            <ThemeProvider paletteKey={palette}><WatersRiseInterrupt/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="discard" label="Discard · Hand > 5" width={900} height={560}>
            <ThemeProvider paletteKey={palette}><DiscardInterrupt/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="swim" label="Swim · Player Stranded" width={900} height={560}>
            <ThemeProvider paletteKey={palette}><SwimInterrupt/></ThemeProvider>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ ENDINGS ━━━━ */}
        <DCSection id="endings" title="Game Over" subtitle="One win, four losses. Helicopter Lift triggers the win sequence.">
          <DCArtboard id="win" label="Victory · Helicopter Escape" width={1200} height={820}>
            <ThemeProvider paletteKey={palette}><WinScreen pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="loss-landing" label="Loss · Fools' Landing sunk" width={1200} height={820}>
            <ThemeProvider paletteKey={palette}><LossScreen reason="fools_landing" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="loss-treasure" label="Loss · Treasure lost forever" width={1200} height={820}>
            <ThemeProvider paletteKey={palette}><LossScreen reason="treasure_lost" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="loss-drown" label="Loss · A crewmate drowned" width={1200} height={820}>
            <ThemeProvider paletteKey={palette}><LossScreen reason="drowned" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="loss-water" label="Loss · Water reached skull" width={1200} height={820}>
            <ThemeProvider paletteKey={palette}><LossScreen reason="water_max" pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ CONNECTIVITY ━━━━ */}
        <DCSection id="conn" title="Connectivity States" subtitle="Mid-game disconnect, reconnect toast.">
          <DCArtboard id="disco" label="Disconnect · Countdown" width={900} height={560}>
            <ThemeProvider paletteKey={palette}><DisconnectState pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="recon" label="Reconnect · Toast" width={420} height={140}>
            <ThemeProvider paletteKey={palette}>
              <div style={{background:'var(--c-ink)', padding:20, height:'100%'}}>
                <ReconnectToast/>
              </div>
            </ThemeProvider>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ RESPONSIVE ━━━━ */}
        <DCSection id="responsive" title="Responsive Variants" subtitle="Tablet (1024) collapses sidebar columns. Mobile (390) uses a tabbed bottom sheet with collapsed status header.">
          <DCArtboard id="tab" label="Tablet · 1024 × 768" width={1024} height={768}>
            <ThemeProvider paletteKey={palette}><TabletGameScreen pawnKind={pawnKind}/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="mob-home" label="Mobile · Home" width={390} height={844}>
            <ThemeProvider paletteKey={palette}><MobileHome/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="mob-cards" label="Mobile · Game · Hand tab" width={390} height={844}>
            <ThemeProvider paletteKey={palette}><MobileGameScreen pawnKind={pawnKind} sheet="cards"/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="mob-crew" label="Mobile · Game · Crew tab" width={390} height={844}>
            <ThemeProvider paletteKey={palette}><MobileGameScreen pawnKind={pawnKind} sheet="crew"/></ThemeProvider>
          </DCArtboard>
          <DCArtboard id="mob-log" label="Mobile · Game · Log tab" width={390} height={844}>
            <ThemeProvider paletteKey={palette}><MobileGameScreen pawnKind={pawnKind} sheet="log"/></ThemeProvider>
          </DCArtboard>
        </DCSection>

        {/* ━━━━ ENGINEERING HANDOFF ━━━━ */}
        <DCSection id="handoff" title="Engineering Handoff" subtitle="Quick map between the design pieces and the components/protocol in DESIGN.md.">
          <DCArtboard id="map" label="Component → DESIGN.md mapping" width={1200} height={760}>
            <ThemeProvider paletteKey={palette}><HandoffBoard/></ThemeProvider>
          </DCArtboard>
        </DCSection>

      </DesignCanvas>

      <TweaksPanel title="Forbidden Island">
        <TweakSection label="Theme"/>
        <PaletteSwatchPicker value={palette} onChange={(k)=>setTweak('palette', k)}/>
        <TweakSection label="Pawns"/>
        <TweakSelect
          label="Style"
          value={pawnKind}
          options={['portrait','chess','badge','gem']}
          onChange={(v)=>setTweak('pawnKind', v)}
        />
        <TweakSection label="Preview"/>
        <div style={{
          display:'flex', justifyContent:'space-around', padding:'8px 6px',
          background:'rgba(255,255,255,.4)', borderRadius:8,
        }}>
          <ThemeProvider paletteKey={palette}>
            <div style={{display:'flex', gap:6}}>
              {ROLES.map(r=>(<Pawn key={r.id} role={r.id} kind={pawnKind} size={26}/>))}
            </div>
          </ThemeProvider>
        </div>
      </TweaksPanel>
    </>
  );
}

// ─── Handoff board (mapping table) ──────────────────────────────────────
function HandoffBoard() {
  const rows = [
    { piece:'<Tile>',           file:'pieces-tiles.jsx',  spec:'components/board/Tile.tsx', notes:'state ∈ normal|flooded|sunk; target highlight via prop' },
    { piece:'<IslandGrid>',     file:'pieces-status.jsx', spec:'components/board/IslandGrid.tsx', notes:'BOARD_MASK + flattenLayout(tiles)' },
    { piece:'<Pawn>',           file:'pieces-roles.jsx',  spec:'components/board/PlayerPawn.tsx', notes:'kind=portrait|chess|badge|gem via theme' },
    { piece:'<TreasureCard>',   file:'pieces-cards.jsx',  spec:'components/cards/TreasureCard.tsx', notes:'switches on type (treasure / heli / sandbags / waters_rise)' },
    { piece:'<FloodCard>',      file:'pieces-cards.jsx',  spec:'components/cards/FloodCard.tsx', notes:'reveals tile mini + name' },
    { piece:'<WaterMeter>',     file:'pieces-status.jsx', spec:'components/status/WaterMeter.tsx', notes:'9 marks; matches WATER_LEVELS rules table' },
    { piece:'<TreasureTracker>',file:'pieces-status.jsx', spec:'components/status/TreasureTracker.tsx', notes:'reads capturedTreasures from state' },
    { piece:'<TurnIndicator>',  file:'pieces-status.jsx', spec:'components/status/TurnIndicator.tsx', notes:'phase ∈ action|draw_treasure|draw_flood|discard|swim|waters_rise' },
    { piece:'<ActionBar>',      file:'pieces-status.jsx', spec:'components/actions/ActionBar.tsx', notes:'available{} mirrors ActionValidator output' },
    { piece:'<PlayerHand>',     file:'(inline)',          spec:'components/cards/PlayerHand.tsx', notes:'fan of TreasureCard at 84×120' },
    { piece:'<GameLog>',        file:'pieces-status.jsx', spec:'components/status/GameLog.tsx', notes:'entries: { turn, text, tone }' },
    { piece:'<HomeScreen>',     file:'screen-lobby.jsx',  spec:'screens/HomeScreen.tsx', notes:'reads GET /api/games; lobby:game_list_updated' },
    { piece:'<WaitingRoom>',    file:'screen-lobby.jsx',  spec:'screens/LobbyScreen.tsx', notes:'lobby:select_role · lobby:start' },
    { piece:'<GameScreen>',     file:'screen-board.jsx',  spec:'screens/GameScreen.tsx', notes:'variant prop only for design — server-driven in prod' },
    { piece:'<*Interrupt>',     file:'screen-flows.jsx',  spec:'(inline modal layers)', notes:'each maps to one of game:phase events' },
    { piece:'<WinScreen> / <LossScreen>', file:'screen-endings.jsx', spec:'screens/GameOverScreen.tsx', notes:'LOSS_REASONS keys ↔ LossReason enum' },
  ];
  return (
    <div style={{padding:'24px 32px', background:'var(--c-ink)', height:'100%'}}>
      <SectionTitle kicker="ENGINEERING · HANDOFF"
        title="Design piece → DESIGN.md component"
        sub="Every component in the design canvas above maps to a TSX file from the spec. Variant props in the design (e.g. `variant='move'`) collapse in production — the real GameScreen renders the current ClientGameState pushed over WebSocket."/>
      <Frame tone="ink2" padded={false} style={{padding:0, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'200px 200px 220px 1fr', padding:'12px 18px', background:'rgba(8,22,28,.6)', borderBottom:'1px solid rgba(202,160,82,.2)'}}>
          {['Design piece','Source file','Spec component','Notes'].map(h=>(
            <div key={h} className="fi-mono" style={{fontSize:10, color:'var(--c-brassHi)', letterSpacing:'.14em'}}>{h.toUpperCase()}</div>
          ))}
        </div>
        {rows.map((r,i)=>(
          <div key={i} style={{display:'grid', gridTemplateColumns:'200px 200px 220px 1fr', padding:'9px 18px',
            borderBottom: i<rows.length-1?'1px solid rgba(202,160,82,.08)':'none',
            background: i%2 ? 'rgba(8,22,28,.25)' : 'transparent', fontSize:11.5, alignItems:'center'}}>
            <div className="fi-mono" style={{color:'var(--c-brassHi)'}}>{r.piece}</div>
            <div className="fi-mono" style={{color:'var(--c-sand)'}}>{r.file}</div>
            <div className="fi-mono" style={{color:'var(--c-sand2)'}}>{r.spec}</div>
            <div style={{color:'var(--c-parch)', lineHeight:1.4}}>{r.notes}</div>
          </div>
        ))}
      </Frame>
      <div style={{marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Frame tone="ink2" padded={false} style={{padding:16}}>
          <div className="fi-cap">WS PROTOCOL · CLIENT → SERVER</div>
          <div className="fi-mono" style={{fontSize:11, color:'var(--c-sand)', marginTop:8, lineHeight:1.7}}>
            lobby:create · lobby:join · lobby:leave<br/>
            lobby:select_role · lobby:set_difficulty · lobby:start<br/>
            game:action ⟨{`{ type, …payload }`}⟩<br/>
            game:reconnect ⟨{`{ gameId, playerId, secret }`}⟩
          </div>
        </Frame>
        <Frame tone="ink2" padded={false} style={{padding:16}}>
          <div className="fi-cap">WS PROTOCOL · SERVER → CLIENT</div>
          <div className="fi-mono" style={{fontSize:11, color:'var(--c-sand)', marginTop:8, lineHeight:1.7}}>
            lobby:identity · lobby:updated · lobby:game_list_updated<br/>
            game:started · game:state · game:turn_changed<br/>
            game:flood_reveal · game:tile_sunk · game:waters_rise<br/>
            game:treasure_captured · game:player_must_swim · game:player_must_discard<br/>
            game:won · game:lost · game:player_(dis|re)connected
          </div>
        </Frame>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

// ─── Custom Tweak: palette swatches ─────────────────────────────────────
function PaletteSwatchPicker({ value, onChange }) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:6}}>
      {PALETTE_KEYS.map(k=>{
        const p = PALETTES[k];
        const sel = k === value;
        return (
          <div key={k} onClick={()=>onChange(k)}
            style={{
              cursor:'pointer',
              padding:'7px 9px',
              borderRadius:8,
              background: sel?'rgba(255,255,255,.6)':'rgba(255,255,255,.25)',
              border: `1px solid ${sel?'#29261b':'rgba(0,0,0,.1)'}`,
              boxShadow: sel?'0 0 0 1px #29261b':'none',
              transition:'all .12s',
            }}>
            <div style={{display:'flex', gap:2, marginBottom:5}}>
              {['ink','sea2','brassHi','parch'].map(s=>(
                <div key={s} style={{flex:1, height:14, borderRadius:2, background:p[s], boxShadow:'0 0 0 .5px rgba(0,0,0,.15)'}}/>
              ))}
            </div>
            <div style={{fontFamily:'var(--ff-ui, system-ui)', fontSize:10.5, fontWeight:600, color:'#29261b', letterSpacing:'.01em'}}>{p.name}</div>
          </div>
        );
      })}
    </div>
  );
}
