// screen-flows.jsx — Setup animation keyframes + interrupt modals +
// special-card flows.

// ─── Setup animation key-frames (5 frames + final) ──────────────────────
function SetupFrame({ width=900, height=560, frame=1, pawnKind='portrait', style }) {
  // 1: tiles fly in (3 placed, others ghosted)
  // 2: initial flooding (6 flood reveal)
  // 3: pawns drop onto starting gates
  // 4: cards dealt
  // 5: water meter sets to chosen level
  // 6: complete -> "Your Turn"
  const tileState = {};
  if (frame >= 2) Object.assign(tileState, { temple_moon:'flooded', cliffs_abandon:'flooded', misty_marsh:'flooded', whispering_garden:'flooded', observatory:'flooded', twilight_hollow:'flooded'});

  const pawnsOn = frame >= 3 ? buildPawnMap({ pawnKind }) : {};

  const titles = {
    1: { kicker:'Step 1 of 5', title:'Lay the island', sub:'24 tiles deal into the diamond pattern.' },
    2: { kicker:'Step 2 of 5', title:'Initial flooding', sub:'Six flood cards mark the first compromised tiles.' },
    3: { kicker:'Step 3 of 5', title:'Crew take their gates', sub:'Each adventurer drops onto their starting tile.' },
    4: { kicker:'Step 4 of 5', title:'Deal opening hands', sub:'Two treasure cards each — re-deal any Waters Rise.' },
    5: { kicker:'Step 5 of 5', title:'Set the tide', sub:'Water meter rises to your chosen difficulty.' },
    6: { kicker:'Ready', title:'Your turn, Captain.', sub:'Three actions. Then the sea takes its share.' },
  };
  const t = titles[frame] || titles[1];

  return (
    <ScreenBg style={{width, height, position:'relative', ...style}}>
      <div style={{position:'relative', height:'100%', display:'grid', gridTemplateColumns:'1fr 1fr'}}>
        {/* board side */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'center', position:'relative'}}>
          <div style={{transform:'scale(0.55)', transformOrigin:'center', opacity: frame===1?0.7:1}}>
            <IslandGrid tileSize={88} gap={7}
              states={tileState}
              pawnsOnTile={pawnsOn}
            />
          </div>
          {/* per-frame focus accent */}
          {frame === 2 && (
            <div style={{position:'absolute', top:30, left:30, display:'flex', gap:8}}>
              {['temple_moon','cliffs_abandon','observatory','whispering_garden','misty_marsh','twilight_hollow'].map((id,i)=>(
                <div key={id} style={{transform:`rotate(${(i-2.5)*4}deg) translateY(${(i%2)*4}px)`}}>
                  <FloodCard tileId={id} width={56} height={78}/>
                </div>
              ))}
            </div>
          )}
          {frame === 4 && (
            <div style={{position:'absolute', bottom:30, left:24, right:24, display:'flex', gap:10, justifyContent:'center'}}>
              <TreasureCard type="earth_stone" width={70} height={100} style={{transform:'rotate(-4deg)'}}/>
              <TreasureCard type="crystal_of_fire" width={70} height={100} style={{transform:'rotate(2deg)'}}/>
              <TreasureCard type="oceans_chalice" width={70} height={100} style={{transform:'rotate(-1deg)'}}/>
            </div>
          )}
          {frame === 5 && (
            <div style={{position:'absolute', right:24, top:'50%', transform:'translateY(-50%)'}}>
              <WaterMeter level={2} compact/>
            </div>
          )}
        </div>
        {/* caption side */}
        <div style={{display:'flex', flexDirection:'column', justifyContent:'center', padding:'0 56px 0 12px'}}>
          <div className="fi-cap" style={{color:'var(--c-brassHi)'}}>{t.kicker}</div>
          <div className="fi-display" style={{fontSize:36,color:'var(--c-parch)',marginTop:8,letterSpacing:'-.005em'}}>{t.title}</div>
          <div style={{fontSize:14, color:'var(--c-sand)', marginTop:10, lineHeight:1.5, maxWidth:340}}>{t.sub}</div>
          {/* progress bar */}
          <div style={{marginTop:24, display:'flex', gap:6}}>
            {[1,2,3,4,5].map(i=>(
              <div key={i} style={{flex:1, height:3, borderRadius:2,
                background: i<=frame?'var(--c-brassHi)':'rgba(202,160,82,.2)'}}/>
            ))}
          </div>
        </div>
      </div>
    </ScreenBg>
  );
}

// ─── Waters Rise! interrupt ─────────────────────────────────────────────
function WatersRiseInterrupt({ width=900, height=560, newLevel=4, style }) {
  return (
    <div style={{width, height, position:'relative', ...style}}>
      <ScreenBg style={{position:'absolute',inset:0}}>
        {/* underlying board, dimmed */}
        <div style={{position:'absolute', inset:0, opacity:.25, filter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{transform:'scale(.55)'}}>
            <IslandGrid tileSize={88} gap={7} states={BASE_TILE_STATE} pawnsOnTile={buildPawnMap()}/>
          </div>
        </div>
        {/* red wash */}
        <div style={{position:'absolute',inset:0,background:'radial-gradient(60% 50% at 50% 50%, rgba(201,82,58,.25) 0%, transparent 80%)'}}/>
        <div style={{position:'absolute',inset:0, display:'flex', alignItems:'center', justifyContent:'center', gap:30}}>
          <div style={{transform:'rotate(-4deg)'}}>
            <WatersRiseFace width={210} height={300} glow/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div>
              <div className="fi-cap" style={{color:'#f0a89a'}}>Hazard Resolved</div>
              <div className="fi-display" style={{fontSize:36,color:'var(--c-parch)',marginTop:6}}>
                The waters <span className="fi-display-i" style={{color:'#f0a89a'}}>rise</span>.
              </div>
            </div>
            <Frame tone="ink2" padded={false} style={{padding:16, display:'flex', alignItems:'center', gap:18}}>
              <WaterMeter level={newLevel} compact/>
              <div>
                <div className="fi-mono" style={{fontSize:10, color:'var(--c-sand2)', letterSpacing:'.12em'}}>WATER LEVEL · 3 → 4</div>
                <div className="fi-display" style={{fontSize:22, color:'var(--c-brassHi)', marginTop:4}}>Draw 3 flood cards / turn</div>
                <div style={{fontSize:11, color:'var(--c-sand)', marginTop:6, maxWidth:280, lineHeight:1.5}}>
                  All flood discards have been shuffled and stacked on top of the flood deck.
                  Previously sunk tiles cannot return.
                </div>
              </div>
            </Frame>
            <div style={{display:'flex',gap:10}}>
              <div className="fi-mono" style={{fontSize:10, color:'var(--c-sand2)', letterSpacing:'.12em', padding:'6px 0'}}>AUTO-RESUMING DRAW PHASE…</div>
              <div style={{flex:1}}/>
              <Btn kind="ghost" size="sm">Continue</Btn>
            </div>
          </div>
        </div>
      </ScreenBg>
    </div>
  );
}

// ─── Discard interrupt ──────────────────────────────────────────────────
function DiscardInterrupt({ width=900, height=560, style }) {
  // Tomás has 6 cards, must discard down to 5
  const hand = [
    { type:'earth_stone' },
    { type:'statue_of_wind' },
    { type:'statue_of_wind' },
    { type:'crystal_of_fire' },
    { type:'oceans_chalice' },
    { type:'sandbags' },
  ];
  return (
    <div style={{width,height,position:'relative', ...style}}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',inset:0, display:'flex',alignItems:'center',justifyContent:'center'}}>
        <Frame tone="ink2" padded={false} style={{padding:24, width: width-80}}>
          <div style={{display:'flex',alignItems:'center', gap:14, marginBottom:16}}>
            <Pawn role="navigator" size={44} isActive/>
            <div>
              <div className="fi-cap" style={{color:'var(--c-brassHi)'}}>Hand Limit Exceeded</div>
              <div className="fi-display" style={{fontSize:22,color:'var(--c-parch)'}}>
                Tomás holds <span className="fi-display-i">six</span> cards. Discard one.
              </div>
              <div style={{fontSize:11.5,color:'var(--c-sand2)',marginTop:4}}>
                Click a card to discard it — or play a special card instead.
              </div>
            </div>
            <div style={{flex:1}}/>
            <div className="fi-mono" style={{fontSize:11, color:'var(--c-danger)', letterSpacing:'.15em'}}>6 / 5</div>
          </div>
          <div style={{display:'flex', gap:10, justifyContent:'center'}}>
            {hand.map((h,i)=>(
              <div key={i} style={{position:'relative', cursor:'pointer'}}>
                <TreasureCard type={h.type} width={100} height={140}/>
                {/* discard hint on hover (always shown on first card for screenshot) */}
                {i===2 && (
                  <div style={{position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)',
                    background:'var(--c-danger)', color:'#fff', padding:'3px 9px', borderRadius:14,
                    fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'.12em', boxShadow:'0 4px 12px rgba(0,0,0,.4)'}}>
                    DISCARD
                  </div>
                )}
                {h.type==='sandbags' && (
                  <div style={{position:'absolute', bottom:-12, left:'50%', transform:'translateX(-50%)'}}>
                    <Btn size="sm" kind="ghost">Play instead?</Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Frame>
      </div>
    </div>
  );
}

// ─── Swim interrupt ─────────────────────────────────────────────────────
function SwimInterrupt({ width=900, height=560, style }) {
  // Wren was on Phantom Rock which just sank — must swim to adjacent non-sunk tile
  const states = { ...BASE_TILE_STATE, phantom_rock:'sunk' };
  const targets = { observatory:'swim', dunes_deception:'swim', copper_gate:'swim' };
  const pawns = buildPawnMap();
  // place wren just off the sunk tile (stranded)
  return (
    <div style={{width,height,position:'relative', ...style}}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',inset:0, display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{display:'flex', gap:30, alignItems:'center'}}>
          <div style={{transform:'scale(.7)', transformOrigin:'center'}}>
            <IslandGrid tileSize={92} gap={7} states={states} targets={targets}
              pawnsOnTile={{
                ...pawns,
                // wren shown stranded near the sunk tile
                phantom_rock:[<div key="w" style={{animation:'fi-bob 1.4s ease-in-out infinite'}}><Pawn role="engineer" size={32} isActive/></div>]
              }}
              dangerTiles={[]}
            />
          </div>
          <div style={{maxWidth: 280}}>
            <Pill tone="danger">SINKING</Pill>
            <div className="fi-display" style={{fontSize:30, color:'var(--c-parch)', marginTop:10, lineHeight:1.15}}>
              <span className="fi-display-i">Wren</span> must swim to safety.
            </div>
            <div style={{fontSize:12, color:'var(--c-sand)', marginTop:8, lineHeight:1.5}}>
              Phantom Rock has sunk beneath the waves. Pick an adjacent, non-sunk tile for Wren to swim to. If no tile is reachable, Wren drowns.
            </div>
            <div className="fi-mono" style={{marginTop:14, fontSize:10, color:'var(--c-flame)', letterSpacing:'.12em'}}>
              3 SAFE TILES AVAILABLE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helicopter Lift target picker (focused view) ───────────────────────
function HelicopterLiftFlow({ width=900, height=560, style }) {
  const pawns = buildPawnMap();
  // multi-select on fools_landing
  pawns.fools_landing = [
    <Pawn key="p" role="pilot" size={28} isActive/>,
    <Pawn key="e" role="engineer" size={28} isActive/>,
  ];
  return (
    <div style={{width,height,position:'relative', ...style}}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',inset:0, display:'grid', gridTemplateColumns:'1fr 320px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{transform:'scale(.65)'}}>
            <IslandGrid tileSize={92} gap={7} states={BASE_TILE_STATE}
              targets={Object.fromEntries(TILES.filter(t=>t.id!=='phantom_rock'&&!['fools_landing'].includes(t.id)).map(t=>[t.id,'fly']))}
              selected="fools_landing"
              pawnsOnTile={pawns}/>
          </div>
        </div>
        <Frame tone="ink2" padded={false} style={{padding:18, alignSelf:'center', marginRight:24}}>
          <HelicopterLiftFace width={180} height={250} glow style={{margin:'0 auto', display:'block'}}/>
          <div className="fi-cap" style={{marginTop:14}}>Step 1 · Who flies?</div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:6}}>
            {[{r:'pilot',n:'Camille',chosen:true},{r:'engineer',n:'Wren',chosen:true}].map(p=>(
              <div key={p.r} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 10px',borderRadius:8,
                background: p.chosen?'rgba(232,196,122,.1)':'rgba(8,22,28,.4)',
                border:`1px solid ${p.chosen?'var(--c-brassHi)':'rgba(202,160,82,.2)'}`}}>
                <Pawn role={p.r} size={26}/>
                <div style={{flex:1, fontSize:12, color:'var(--c-parch)'}}>{p.n}</div>
                <div style={{
                  width:16, height:16, borderRadius:4,
                  background: p.chosen?'var(--c-brassHi)':'transparent',
                  border:`1px solid ${p.chosen?'var(--c-brassHi)':'var(--c-brassLo)'}`,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  color:'var(--c-ink)', fontSize:11, fontWeight:700,
                }}>{p.chosen?'✓':''}</div>
              </div>
            ))}
          </div>
          <div className="fi-cap" style={{marginTop:14}}>Step 2 · Pick destination</div>
          <div style={{fontSize:11,color:'var(--c-sand)',marginTop:4,lineHeight:1.5}}>
            Click any non-sunk tile on the island.
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <Btn kind="ghost" size="sm">Cancel</Btn>
            <Btn kind="primary" size="sm" disabled>Lift Off</Btn>
          </div>
        </Frame>
      </div>
    </div>
  );
}

// ─── Sandbags target picker ─────────────────────────────────────────────
function SandbagsFlow({ width=900, height=560, style }) {
  const targets = { cliffs_abandon:'shore', misty_marsh:'shore', observatory:'shore', whispering_garden:'shore', twilight_hollow:'shore' };
  return (
    <div style={{width,height,position:'relative', ...style}}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',inset:0, display:'grid', gridTemplateColumns:'1fr 320px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{transform:'scale(.65)'}}>
            <IslandGrid tileSize={92} gap={7} states={BASE_TILE_STATE} targets={targets} pawnsOnTile={buildPawnMap()}/>
          </div>
        </div>
        <Frame tone="ink2" padded={false} style={{padding:18, alignSelf:'center', marginRight:24}}>
          <SandbagsFace width={180} height={250} glow style={{margin:'0 auto', display:'block'}}/>
          <div className="fi-cap" style={{marginTop:14}}>Pick a flooded tile</div>
          <div style={{fontSize:11,color:'var(--c-sand)',marginTop:4,lineHeight:1.5}}>
            Sandbags shore up <span className="fi-display-i" style={{color:'var(--c-brassHi)'}}>any</span> flooded tile on the entire island.
            No action cost. The card discards on use.
          </div>
          <div style={{marginTop:14}}>
            <div className="fi-mono" style={{fontSize:10,color:'var(--c-brass)',letterSpacing:'.12em'}}>5 ELIGIBLE TILES</div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <Btn kind="ghost" size="sm">Cancel</Btn>
            <Btn kind="quiet" size="sm">Discard Instead</Btn>
          </div>
        </Frame>
      </div>
    </div>
  );
}

// ─── Navigator move-other-player flow ──────────────────────────────────
function NavigatorFlow({ width=900, height=560, style }) {
  const targets = { dunes_deception:'move', observatory:'move' };
  const pawns = buildPawnMap();
  return (
    <div style={{width,height,position:'relative', ...style}}>
      <ScreenBg style={{position:'absolute',inset:0}}/>
      <div style={{position:'absolute',inset:0, display:'grid', gridTemplateColumns:'1fr 320px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{transform:'scale(.65)'}}>
            <IslandGrid tileSize={92} gap={7} states={BASE_TILE_STATE} targets={targets} pawnsOnTile={pawns}
              selected="copper_gate"/>
          </div>
        </div>
        <Frame tone="ink2" padded={false} style={{padding:18, alignSelf:'center', marginRight:24}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <Pawn role="navigator" size={44} isActive/>
            <div>
              <div className="fi-cap" style={{color:'var(--c-brassHi)'}}>Navigator · Move Another</div>
              <div className="fi-display" style={{fontSize:18,color:'var(--c-parch)'}}>Guiding the Explorer</div>
            </div>
          </div>
          <div className="fi-cap" style={{marginTop:14}}>Step 1 of 2 — Selected pawn</div>
          <div style={{padding:'8px 10px',background:'rgba(232,196,122,.1)',border:'1px solid var(--c-brassHi)',
            borderRadius:8, marginTop:6, display:'flex',alignItems:'center',gap:10}}>
            <Pawn role="explorer" size={28}/>
            <div style={{flex:1, fontSize:12,color:'var(--c-parch)'}}>Jules · Explorer</div>
          </div>
          <div className="fi-cap" style={{marginTop:14}}>Step 2 — Up to two tiles</div>
          <div style={{display:'flex',gap:6,marginTop:6}}>
            <div style={{flex:1, padding:'6px 8px', background:'rgba(8,22,28,.5)', borderRadius:6, fontSize:10.5, color:'var(--c-sand)', fontFamily:'var(--ff-mono)'}}>HOP 1: <span style={{color:'var(--c-brassHi)'}}>Copper → Dunes</span></div>
            <div style={{flex:1, padding:'6px 8px', background:'rgba(8,22,28,.3)', borderRadius:6, fontSize:10.5, color:'var(--c-sand2)', fontFamily:'var(--ff-mono)'}}>HOP 2: <span style={{opacity:.6}}>—</span></div>
          </div>
          <div style={{fontSize:10.5, color:'var(--c-sand2)', marginTop:8, lineHeight:1.4}}>
            Uses normal movement rules (not the target's special ability). Costs the Navigator 1 action.
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <Btn kind="ghost" size="sm">Cancel</Btn>
            <Btn kind="quiet" size="sm">Done (1 tile)</Btn>
          </div>
        </Frame>
      </div>
    </div>
  );
}

Object.assign(window, { SetupFrame, WatersRiseInterrupt, DiscardInterrupt, SwimInterrupt, HelicopterLiftFlow, SandbagsFlow, NavigatorFlow });
