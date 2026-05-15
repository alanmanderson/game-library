// screen-responsive.jsx — Tablet (768) and Mobile (390) layouts.
//
// Tablet: 2-column — board on top, cards/log below.
// Mobile: single column with tabbed sheet at bottom (Board / Cards / Crew),
//   plus a portrait-friendly diamond grid (smaller tiles), action drawer.

// ─── Tablet game screen (1024 x 768) ────────────────────────────────────
function TabletGameScreen({ width=1024, height=768, pawnKind='portrait', style }) {
  return (
    <ScreenBg style={{width, height, ...style}}>
      <div style={{display:'grid', gridTemplateRows:'auto 1fr auto', height:'100%', gap:10, padding:12}}>
        <div style={{display:'flex',alignItems:'center', gap:10}}>
          <BrandMark size="sm"/>
          <div style={{flex:1}}/>
          <TurnIndicator currentPlayer="Camille" role="pilot" actionsRemaining={2} isYou phase="action" style={{flex:'0 0 auto'}}/>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 240px', gap:10, minHeight:0}}>
          <div style={{position:'relative', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <IslandGrid tileSize={86} gap={7} states={BASE_TILE_STATE}
              pawnsOnTile={buildPawnMap({pawnKind})}
              captured={['earth_stone']}
              targets={{lost_lagoon:'move', cave_embers:'move'}}
              selected="fools_landing"/>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:8, overflow:'hidden'}}>
            <Frame tone="ink2" padded={false} style={{padding:10}}>
              <div className="fi-cap" style={{marginBottom:6}}>Crew</div>
              <div style={{display:'flex', flexDirection:'column', gap:5}}>
                {BASE_PLAYERS.map(p=>(
                  <PlayerInfo key={p.name} {...p} pawnKind={pawnKind}/>
                ))}
              </div>
            </Frame>
            <Frame tone="ink2" padded={false} style={{padding:10}}>
              <TreasureTracker captured={['earth_stone']} layout="column"/>
            </Frame>
            <Frame tone="ink2" padded={false} style={{padding:10, display:'flex', justifyContent:'center'}}>
              <WaterMeter level={4} compact/>
            </Frame>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
          <Frame tone="ink2" padded={false} style={{padding:10}}>
            <div className="fi-cap" style={{marginBottom:6}}>Hand · 3/5</div>
            <div style={{display:'flex',gap:6}}>
              {BASE_HAND.map((h,i)=><TreasureCard key={i} type={h.type} width={70} height={100}/>)}
              <div style={{flex:1}}/>
              <DeckStack count={16} width={50} height={70} label="Treasure"/>
              <DeckStack count={11} width={50} height={70} label="Flood" tone="flood"/>
            </div>
          </Frame>
          <ActionBar available={{move:true, shore:true, give:false, capture:false, end:true}}/>
        </div>
      </div>
    </ScreenBg>
  );
}

// ─── Mobile game screen (390 x 844, iPhone) ─────────────────────────────
function MobileGameScreen({ width=390, height=844, pawnKind='portrait', sheet='cards', style }) {
  // sheet: 'cards' | 'crew' | 'log'
  return (
    <ScreenBg style={{width, height, ...style}}>
      <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
        {/* status header */}
        <div style={{padding:'10px 12px', display:'flex', alignItems:'center', gap:8,
          background:'rgba(8,22,28,.6)', borderBottom:'1px solid rgba(202,160,82,.2)'}}>
          <Compass size={20} color="var(--c-brassHi)"/>
          <div style={{flex:1}}>
            <div className="fi-mono" style={{fontSize:9, color:'var(--c-sand2)', letterSpacing:'.14em'}}>YOUR TURN · 2 ACTIONS</div>
            <div className="fi-display" style={{fontSize:14, color:'var(--c-parch)'}}>Camille · Pilot</div>
          </div>
          {/* water mini gauge */}
          <div style={{textAlign:'right'}}>
            <div className="fi-mono" style={{fontSize:8, color:'var(--c-sand2)'}}>WATER</div>
            <div style={{display:'flex',gap:1,marginTop:2}}>
              {[...Array(9)].map((_,i)=>(
                <div key={i} style={{width:5,height:14,borderRadius:1,
                  background:i<4?'var(--c-sea2)':'transparent',
                  border:'1px solid rgba(202,160,82,.4)'}}/>
              ))}
            </div>
          </div>
        </div>
        {/* treasure tracker mini */}
        <div style={{display:'flex',gap:6,padding:'8px 12px', justifyContent:'space-between',background:'rgba(8,22,28,.4)'}}>
          {Object.keys(TREASURE_DATA).map(t=>{
            const captured = t==='earth_stone';
            return (
              <div key={t} style={{display:'flex',alignItems:'center',gap:4,opacity:captured?1:0.55}}>
                <TreasureMark treasure={t} captured={captured} size={18}/>
                <div className="fi-mono" style={{fontSize:9, color:captured?'var(--c-brassHi)':'var(--c-sand2)'}}>
                  {captured?'✓':'—'}
                </div>
              </div>
            );
          })}
        </div>
        {/* board */}
        <div style={{flex:1, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
          <div style={{transform:'scale(.86)'}}>
            <IslandGrid tileSize={52} gap={4} states={BASE_TILE_STATE}
              showNames={false}
              pawnsOnTile={buildPawnMap({pawnKind})}
              targets={{lost_lagoon:'move', cave_embers:'move'}}
              selected="fools_landing"/>
          </div>
          {/* selected-tile floating label */}
          <div style={{position:'absolute', bottom: 8, left:0, right:0, display:'flex', justifyContent:'center'}}>
            <div style={{padding:'5px 10px', background:'rgba(8,22,28,.85)', border:'1px solid var(--c-brassHi)', borderRadius:14}}>
              <div className="fi-display-i" style={{fontSize:13,color:'var(--c-brassHi)'}}>Fools' Landing — selected</div>
            </div>
          </div>
        </div>
        {/* action drawer */}
        <div style={{padding:'8px 8px 4px', background:'rgba(8,22,28,.7)', borderTop:'1px solid rgba(202,160,82,.18)'}}>
          <div style={{display:'flex',gap:5}}>
            {ACTION_DEFS.map(a=>(
              <button key={a.id} className="fi" style={{
                flex:1, padding:'8px 0', borderRadius:8,
                background: a.id==='move'?'linear-gradient(180deg,rgba(232,196,122,.2),rgba(202,160,82,.05))':'rgba(8,22,28,.4)',
                border:`1px solid ${a.id==='move'?'var(--c-brassHi)':'rgba(202,160,82,.2)'}`,
                color:'var(--c-parch)', fontSize:9.5, fontWeight:600, letterSpacing:'.06em',
                display:'flex',flexDirection:'column',alignItems:'center',gap:2,
              }}>
                <ActionGlyph kind={a.glyph} size={16} color={a.id==='move'?'var(--c-brassHi)':'currentColor'}/>
                {a.name.toUpperCase().split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
        {/* tabs */}
        <div style={{display:'flex', background:'rgba(8,22,28,.95)', borderTop:'1px solid rgba(202,160,82,.18)'}}>
          {['cards','crew','log'].map(s=>(
            <div key={s} style={{
              flex:1, padding:'8px 0', textAlign:'center', cursor:'pointer',
              borderBottom: sheet===s?'2px solid var(--c-brassHi)':'2px solid transparent',
              color: sheet===s?'var(--c-brassHi)':'var(--c-sand2)',
              fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'.12em', textTransform:'uppercase',
            }}>{s==='cards'?`Hand · 3/5`:s==='crew'?'Crew':'Log'}</div>
          ))}
        </div>
        {/* sheet body */}
        <div style={{padding:'10px 12px', background:'var(--c-ink2)', borderTop:'1px solid rgba(202,160,82,.1)', height: 130}}>
          {sheet==='cards' && (
            <div style={{display:'flex',gap:6, overflowX:'auto'}}>
              {BASE_HAND.map((h,i)=><TreasureCard key={i} type={h.type} width={74} height={104}/>)}
            </div>
          )}
          {sheet==='crew' && (
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {BASE_PLAYERS.slice(0,3).map(p=><PlayerInfo key={p.name} {...p} pawnKind={pawnKind}/>)}
            </div>
          )}
          {sheet==='log' && (
            <GameLog entries={BASE_LOG.slice(0,4)}/>
          )}
        </div>
      </div>
    </ScreenBg>
  );
}

// ─── Mobile lobby (home) ────────────────────────────────────────────────
function MobileHome({ width=390, height=844, style }) {
  return (
    <ScreenBg style={{width, height, ...style}}>
      <div style={{padding:'34px 20px', display:'flex', flexDirection:'column', gap:18}}>
        <BrandMark size="md"/>
        <div className="fi-display-i" style={{fontSize:15, color:'var(--c-sand)', lineHeight:1.45}}>
          Four sacred treasures lie scattered across a sinking island. Recover them with your crew.
        </div>
        <Frame tone="ink2" padded={false} style={{padding:14}}>
          <div className="fi-cap" style={{marginBottom:6}}>Your Name</div>
          <input readOnly defaultValue="Camille" className="fi" style={{
            width:'100%', padding:'10px 12px', fontSize:14,
            background:'rgba(8,22,28,.6)', color:'var(--c-parch)',
            border:'1px solid var(--c-brassLo)', borderRadius:8,
            fontFamily:'var(--ff-display)', fontStyle:'italic', outline:'none',
          }}/>
          <Btn kind="primary" size="lg" glow style={{width:'100%', marginTop:10}}>Create Game</Btn>
        </Frame>
        <div>
          <div className="fi-cap" style={{marginBottom:8}}>Open Expeditions · 3</div>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {[{h:'Wren',c:3,d:'Elite'},{h:'Tomás',c:1,d:'Novice'},{h:'Brunhild',c:2,d:'Normal'}].map((g,i)=>(
              <div key={i} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                background:'rgba(20,48,56,.5)', borderRadius:10,
                border:'1px solid rgba(202,160,82,.2)',
              }}>
                <div style={{flex:1}}>
                  <div className="fi-display" style={{fontSize:14, color:'var(--c-parch)'}}>{g.h}'s</div>
                  <div style={{display:'flex',gap:4,marginTop:3}}>
                    <Pill tone="brass" style={{fontSize:8.5,padding:'2px 6px'}}>{g.d}</Pill>
                    <Pill tone="sea" style={{fontSize:8.5,padding:'2px 6px'}}>{g.c}/4</Pill>
                  </div>
                </div>
                <Btn size="sm">Join</Btn>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScreenBg>
  );
}

Object.assign(window, { TabletGameScreen, MobileGameScreen, MobileHome });
