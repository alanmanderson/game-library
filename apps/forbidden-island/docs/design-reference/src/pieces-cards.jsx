// pieces-cards.jsx — All card types in the game.
//
// TreasureCard (sub-types):
//   - Treasure (4 variants: earth_stone, statue_of_wind, crystal_of_fire, oceans_chalice)
//   - Helicopter Lift
//   - Sandbags
//   - Waters Rise!
// FloodCard — one per tile (24 total)
// All cards have face-up and face-down variants. Card backs are decorative.

// ─── Card frame ──────────────────────────────────────────────────────────
function CardFrame({ children, width=140, height=200, style, tone='parch', interactive, glow }) {
  const tones = {
    parch:
      'radial-gradient(120% 100% at 25% 10%, var(--c-parch) 0%, var(--c-sand) 60%, var(--c-sand2) 100%)',
    storm:
      'radial-gradient(120% 100% at 25% 10%, #4a5e6e 0%, #1a2e3a 70%, #0c1820 100%)',
    flood:
      'radial-gradient(120% 100% at 25% 10%, #2c6a78 0%, #144048 60%, #08222a 100%)',
    danger:
      'radial-gradient(120% 100% at 30% 10%, #e58a72 0%, #c9523a 55%, #4a1a10 100%)',
    sky:
      'radial-gradient(120% 100% at 25% 10%, #c9deea 0%, #6fa5c4 70%, #2a587a 100%)',
  };
  return (
    <div style={{
      width, height,
      position:'relative',
      borderRadius: 10,
      background: tones[tone],
      boxShadow:
        '0 0 0 1px var(--c-brassLo) inset, 0 1px 0 rgba(255,255,255,.4) inset, 0 8px 20px rgba(0,0,0,.45)' +
        (glow ? ', 0 0 0 2px var(--c-brassHi), 0 0 32px rgba(232,196,122,.5)' : ''),
      overflow:'hidden',
      cursor: interactive?'pointer':'default',
      transition:'transform .15s, box-shadow .15s',
      ...style,
    }}>
      {/* paper grain */}
      <div aria-hidden style={{position:'absolute',inset:0,
        backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.18'/></svg>\")",
        mixBlendMode:'overlay', opacity:.7, pointerEvents:'none'}}/>
      {/* inner gold rule */}
      <div style={{position:'absolute',inset:5,borderRadius:7,border:'1px solid rgba(202,160,82,.45)',pointerEvents:'none'}}/>
      {children}
    </div>
  );
}

// ─── Treasure card (one of 4 treasure types) ─────────────────────────────
function TreasureCardFace({ treasure, width=140, height=200, count, glow, style }) {
  const d = TREASURE_DATA[treasure];
  return (
    <CardFrame width={width} height={height} glow={glow} style={style}>
      <div style={{padding:'14px 12px 10px', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', position:'relative'}}>
        <div className="fi-cap" style={{color:'var(--c-brassLo)',marginBottom:6}}>TREASURE</div>
        <div style={{flex:1, display:'flex',alignItems:'center',justifyContent:'center', position:'relative', width:'100%'}}>
          {/* halo */}
          <div style={{position:'absolute',inset:0,background:`radial-gradient(60% 60% at 50% 50%, ${d.color}66 0%, transparent 70%)`}}/>
          <div style={{
            width: Math.round(width*0.55), height: Math.round(width*0.55), borderRadius:'50%',
            background:`radial-gradient(circle at 30% 25%, ${d.color} 0%, color-mix(in oklab, ${d.color} 40%, #2a1a08) 100%)`,
            border:'2px solid var(--c-brassLo)',
            boxShadow:`0 0 24px ${d.color}80, inset 0 -8px 14px rgba(0,0,0,.4), inset 0 4px 8px rgba(255,255,255,.2)`,
            display:'flex',alignItems:'center',justifyContent:'center', position:'relative'
          }}>
            <TreasureGlyph kind={d.glyph} size={Math.round(width*0.3)} color="rgba(255,245,216,.95)"/>
          </div>
        </div>
        <div className="fi-display-i" style={{fontSize: Math.round(width*0.105), color:'var(--c-inkText)', lineHeight:1.1, marginTop:6}}>{d.name}</div>
        <div className="fi-mono" style={{fontSize:9, color:'var(--c-inkText2)', marginTop:4, letterSpacing:'.1em'}}>
          COLLECT 4 TO CAPTURE
        </div>
        {count != null && (
          <div style={{position:'absolute', top:8, right:10,
            background:'var(--c-ink)', color:'var(--c-brassHi)',
            borderRadius:10, padding:'1px 6px', fontFamily:'var(--ff-mono)', fontSize:10, fontWeight:600
          }}>×{count}</div>
        )}
      </div>
    </CardFrame>
  );
}

// ─── Helicopter Lift card ────────────────────────────────────────────────
function HelicopterLiftFace({ width=140, height=200, glow, style }) {
  return (
    <CardFrame width={width} height={height} tone="sky" glow={glow} style={style}>
      <div style={{padding:'14px 12px 10px', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center'}}>
        <div className="fi-cap" style={{color:'var(--c-brassLo)',marginBottom:6}}>SPECIAL · ANY TIME</div>
        <div style={{flex:1, display:'flex',alignItems:'center',justifyContent:'center', width:'100%'}}>
          <svg viewBox="0 0 80 60" width={Math.round(width*0.7)} height={Math.round(width*0.5)} style={{filter:'drop-shadow(0 4px 8px rgba(0,0,0,.3))'}}>
            {/* helicopter body */}
            <ellipse cx="40" cy="38" rx="22" ry="8" fill="#1a2e3a"/>
            <rect x="36" y="20" width="3" height="18" fill="#1a2e3a"/>
            {/* rotor */}
            <line x1="10" y1="20" x2="68" y2="20" stroke="#1a2e3a" strokeWidth="2"/>
            <circle cx="40" cy="20" r="2" fill="#1a2e3a"/>
            {/* tail */}
            <path d="M58 38 L74 32 L74 36 Z" fill="#1a2e3a"/>
            {/* skids */}
            <line x1="22" y1="48" x2="58" y2="48" stroke="#1a2e3a" strokeWidth="2"/>
            <line x1="24" y1="44" x2="24" y2="48" stroke="#1a2e3a" strokeWidth="2"/>
            <line x1="56" y1="44" x2="56" y2="48" stroke="#1a2e3a" strokeWidth="2"/>
            {/* window highlight */}
            <ellipse cx="30" cy="35" rx="6" ry="3" fill="#caa052"/>
          </svg>
        </div>
        <div className="fi-display-i" style={{fontSize: Math.round(width*0.115), color:'var(--c-ink)'}}>Helicopter Lift</div>
        <div style={{fontSize: Math.round(width*0.07), color:'var(--c-inkText)', marginTop:5, lineHeight:1.35, padding:'0 6px'}}>
          Move 1+ pawns sharing a tile to any tile.
        </div>
      </div>
    </CardFrame>
  );
}

// ─── Sandbags card ──────────────────────────────────────────────────────
function SandbagsFace({ width=140, height=200, glow, style }) {
  return (
    <CardFrame width={width} height={height} tone="parch" glow={glow} style={style}>
      <div style={{padding:'14px 12px 10px', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center'}}>
        <div className="fi-cap" style={{color:'var(--c-brassLo)',marginBottom:6}}>SPECIAL · ANY TIME</div>
        <div style={{flex:1, display:'flex',alignItems:'center',justifyContent:'center', width:'100%'}}>
          <svg viewBox="0 0 80 60" width={Math.round(width*0.7)} height={Math.round(width*0.5)}>
            {/* stack of sandbags */}
            <ellipse cx="22" cy="44" rx="14" ry="5" fill="#b1925a"/>
            <ellipse cx="40" cy="44" rx="14" ry="5" fill="#b1925a"/>
            <ellipse cx="58" cy="44" rx="14" ry="5" fill="#b1925a"/>
            <ellipse cx="31" cy="34" rx="14" ry="5" fill="#caa052"/>
            <ellipse cx="49" cy="34" rx="14" ry="5" fill="#caa052"/>
            <ellipse cx="40" cy="24" rx="14" ry="5" fill="#e3c081"/>
            {/* tie ropes */}
            <line x1="22" y1="44" x2="22" y2="40" stroke="#5e421c" strokeWidth="1"/>
            <line x1="40" y1="44" x2="40" y2="40" stroke="#5e421c" strokeWidth="1"/>
            <line x1="58" y1="44" x2="58" y2="40" stroke="#5e421c" strokeWidth="1"/>
            <line x1="40" y1="24" x2="40" y2="20" stroke="#5e421c" strokeWidth="1"/>
          </svg>
        </div>
        <div className="fi-display-i" style={{fontSize: Math.round(width*0.115), color:'var(--c-ink)'}}>Sandbags</div>
        <div style={{fontSize: Math.round(width*0.07), color:'var(--c-inkText)', marginTop:5, lineHeight:1.35, padding:'0 6px'}}>
          Shore up any flooded tile anywhere on the island.
        </div>
      </div>
    </CardFrame>
  );
}

// ─── Waters Rise! card ──────────────────────────────────────────────────
function WatersRiseFace({ width=140, height=200, glow, style }) {
  return (
    <CardFrame width={width} height={height} tone="danger" glow={glow} style={style}>
      <div style={{padding:'14px 12px 10px', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', color:'#fff5e0'}}>
        <div className="fi-cap" style={{color:'#fff5e0',marginBottom:6, opacity:.85}}>HAZARD · RESOLVE IMMEDIATELY</div>
        <div style={{flex:1, display:'flex',alignItems:'center',justifyContent:'center', width:'100%'}}>
          <svg viewBox="0 0 80 60" width={Math.round(width*0.75)} height={Math.round(width*0.55)}>
            <path d="M0 50 Q10 36 22 44 T44 44 T66 44 T80 38 L80 60 L0 60 Z" fill="rgba(255,255,255,.18)"/>
            <path d="M0 42 Q10 28 22 36 T44 36 T66 36 T80 30 L80 60 L0 60 Z" fill="rgba(255,255,255,.3)"/>
            <path d="M0 34 Q10 20 22 28 T44 28 T66 28 T80 22 L80 60 L0 60 Z" fill="rgba(255,255,255,.55)"/>
            <polygon points="38,4 42,4 45,18 35,18" fill="#fff5e0"/>
            <polygon points="40,4 38,18 42,18" fill="#7a2a1c"/>
          </svg>
        </div>
        <div className="fi-display" style={{fontSize: Math.round(width*0.135), letterSpacing:'.02em', fontWeight:500}}>Waters Rise!</div>
        <div style={{fontSize: Math.round(width*0.065), marginTop:5, lineHeight:1.35, padding:'0 6px', opacity:.92}}>
          +1 water level. Reshuffle flood discards onto the top of the flood deck.
        </div>
      </div>
    </CardFrame>
  );
}

// ─── Treasure card switchboard ──────────────────────────────────────────
function TreasureCard({ type, ...rest }) {
  if (type === 'helicopter_lift') return <HelicopterLiftFace {...rest}/>;
  if (type === 'sandbags')        return <SandbagsFace {...rest}/>;
  if (type === 'waters_rise')     return <WatersRiseFace {...rest}/>;
  return <TreasureCardFace treasure={type} {...rest}/>;
}

// ─── Card back (face-down) ──────────────────────────────────────────────
function CardBack({ width=140, height=200, label='Treasure Deck', style, tone='deck' }) {
  const bg = tone === 'flood'
    ? 'radial-gradient(120% 120% at 50% 0%, #1c5868 0%, #0c2e38 80%)'
    : 'radial-gradient(120% 120% at 50% 0%, #1d4048 0%, #08161c 80%)';
  return (
    <div style={{
      width, height, borderRadius:10,
      background: bg,
      border:'1px solid var(--c-brassLo)',
      boxShadow:'0 0 0 1px rgba(202,160,82,.3) inset, 0 8px 20px rgba(0,0,0,.45)',
      position:'relative', overflow:'hidden',
      ...style,
    }}>
      <div style={{position:'absolute',inset:6,border:'1px solid rgba(202,160,82,.35)',borderRadius:7}}/>
      <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10}}>
        <Compass size={Math.round(width*0.45)} color="var(--c-brass)" style={{opacity:.85}}/>
        <div className="fi-sc" style={{fontSize:10, color:'var(--c-brassHi)', letterSpacing:'.18em'}}>{label}</div>
      </div>
    </div>
  );
}

// ─── Flood card ─────────────────────────────────────────────────────────
function FloodCard({ tileId, width=130, height=180, style, glow, sunk }) {
  const t = TILES_BY_ID[tileId];
  if (!t) return null;
  return (
    <CardFrame width={width} height={height} tone="flood" glow={glow} style={style}>
      <div style={{padding:'12px 10px 8px', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', color:'#e6f4f5'}}>
        <div className="fi-cap" style={{color:'#e6f4f5',marginBottom:5,opacity:.85}}>FLOOD</div>
        <div style={{flex:1, display:'flex',alignItems:'center',justifyContent:'center', width:'100%', position:'relative'}}>
          {/* miniature of the tile */}
          <div style={{position:'relative', width: Math.round(width*0.55), height: Math.round(width*0.55), borderRadius:8,
            background:`radial-gradient(120% 100% at 30% 20%, ${t.hue1} 0%, ${t.hue2} 100%)`,
            boxShadow:'inset 0 0 0 1px rgba(202,160,82,.4), inset 0 -8px 14px rgba(0,0,0,.4)', overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <TileGlyph kind={t.glyph} size={Math.round(width*0.28)}/>
            </div>
            <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg, rgba(58,151,168,.2) 0%, rgba(26,77,90,.7) 100%)', mixBlendMode:'multiply'}}/>
          </div>
        </div>
        <div className="fi-display-i" style={{fontSize: Math.round(width*0.095), color:'#fff5e0', marginTop:5, lineHeight:1.05}}>
          {t.name}
        </div>
        {sunk && (
          <div className="fi-mono" style={{marginTop:3,fontSize:9, color:'var(--c-danger)', letterSpacing:'.15em'}}>↓ SINKS ↓</div>
        )}
      </div>
    </CardFrame>
  );
}

// ─── Mini deck visual (stack of card-backs) ─────────────────────────────
function DeckStack({ count = 18, width=90, height=130, label='Treasure', sub, tone='deck', style }) {
  const layers = Math.min(5, Math.max(1, Math.round(count/6)));
  return (
    <div style={{position:'relative', width: width+12, height: height+10, ...style}}>
      {[...Array(layers)].map((_,i)=>(
        <div key={i} style={{position:'absolute', top:i*1.2, left:i*1.4}}>
          <CardBack width={width} height={height} label={label} tone={tone==='flood'?'flood':'deck'}/>
        </div>
      ))}
      <div className="fi-mono" style={{position:'absolute', bottom:-18, left:0, right:0, textAlign:'center', fontSize:10, color:'var(--c-sand2)'}}>
        {label} · {count} {sub?`· ${sub}`:''}
      </div>
    </div>
  );
}

Object.assign(window, {
  CardFrame, TreasureCard, TreasureCardFace, HelicopterLiftFace, SandbagsFace, WatersRiseFace,
  CardBack, FloodCard, DeckStack,
});
