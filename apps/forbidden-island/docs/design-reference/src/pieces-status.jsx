// pieces-status.jsx — Status & layout primitives.
//
// WaterMeter, TreasureTracker, TurnIndicator, ActionBar, GameLog,
// IslandGrid (diamond board), and a couple of shared helpers.

// ─── Water meter ─────────────────────────────────────────────────────────
// 9 levels, 1-2 = 2, 3-4 = 3, 5-6 = 4, 7-8 = 5, 9 = skull (instant loss)
const WATER_LEVELS = [
  { lv: 1, draw: 2, label: 'Novice'   },
  { lv: 2, draw: 2, label: 'Normal'   },
  { lv: 3, draw: 3, label: 'Elite'    },
  { lv: 4, draw: 3, label: 'Legendary'},
  { lv: 5, draw: 4 },
  { lv: 6, draw: 4 },
  { lv: 7, draw: 5 },
  { lv: 8, draw: 5 },
  { lv: 9, draw: 'X', skull: true },
];

function WaterMeter({ level = 2, orientation='vertical', compact, style }) {
  const isV = orientation === 'vertical';
  // gauge metaphor: brass vessel, water fills from bottom to the marker
  const w = isV ? (compact?54:74) : (compact?260:360);
  const h = isV ? (compact?230:300) : (compact?54:74);

  const stops = WATER_LEVELS;
  // current draw rate
  const cur = stops[level-1];
  const skull = level >= 9;

  return (
    <div style={{ width: w, ...style }}>
      <div className="fi-cap" style={{marginBottom:6, textAlign:isV?'center':'left'}}>Water Level</div>
      <div style={{position:'relative', width: w, height: h, 
        background:'linear-gradient(180deg, #08161c 0%, #143038 100%)',
        border:'1px solid var(--c-brassLo)',
        borderRadius:10,
        boxShadow:'0 1px 0 rgba(255,255,255,.05) inset, 0 8px 22px rgba(0,0,0,.5)',
        padding: 6, overflow:'hidden',
      }}>
        {/* water fill */}
        <div style={{
          position:'absolute', left:0, right:0, bottom:0,
          height: `${(level/9)*100}%`,
          background:`linear-gradient(180deg, ${skull?'var(--c-danger)':'var(--c-sea2)'} 0%, ${skull?'#7a2a1c':'var(--c-sea)'} 100%)`,
          transition:'height .35s cubic-bezier(.4,1.6,.5,1), background .3s',
        }}>
          {/* wavy top */}
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{position:'absolute',top:-6,left:0,width:'100%',height:8}}>
            <path d="M0 5 Q12 0 25 5 T50 5 T75 5 T100 5 L100 10 L0 10 Z" fill={skull?'var(--c-danger)':'var(--c-sea2)'}/>
          </svg>
        </div>
        {/* level marks */}
        <div style={{position:'absolute', inset: 8, display:'flex', flexDirection:'column-reverse', justifyContent:'space-between', alignItems:'stretch'}}>
          {stops.map((s,i)=>{
            const lv = s.lv;
            const isCur = lv === level;
            return (
              <div key={lv} style={{display:'flex',alignItems:'center', gap:8, height: (h-16)/9}}>
                <div style={{
                  flex:'0 0 auto',
                  width:8, height:1.2, background: s.skull ? 'var(--c-danger)':'var(--c-brass)',
                  opacity: s.skull ? 1 : 0.7
                }}/>
                <div className="fi-mono" style={{
                  flex:'1 1 auto', fontSize: 9,
                  color: isCur ? 'var(--c-brassHi)' : (s.skull?'var(--c-danger)':'rgba(232,212,166,.6)'),
                  fontWeight: isCur?700:500, letterSpacing:'.1em', textAlign:'right', paddingRight:4,
                }}>
                  {s.skull ? '☠ END' : `${lv} · DRAW ${s.draw}`}
                  {s.label && <div style={{fontSize:8, opacity:.6, lineHeight:1}}>{s.label}</div>}
                </div>
              </div>
            );
          })}
        </div>
        {/* current marker */}
        <div style={{
          position:'absolute', left:-3, right:-3,
          bottom:`calc(${((level)/9)*100}% - 2px)`,
          height: 4, background: 'var(--c-brassHi)',
          boxShadow:'0 0 12px var(--c-brassHi)',
          transition:'bottom .35s cubic-bezier(.4,1.6,.5,1)',
        }}/>
      </div>
      <div style={{textAlign:isV?'center':'left',marginTop:6}}>
        <div className="fi-display" style={{fontSize:18, color: skull?'var(--c-danger)':'var(--c-brassHi)'}}>
          {skull ? 'Drowned' : `Draw ${cur.draw}`}
        </div>
        <div className="fi-mono" style={{fontSize:9, color:'var(--c-sand2)'}}>flood cards / turn</div>
      </div>
    </div>
  );
}

// ─── Treasure tracker ────────────────────────────────────────────────────
function TreasureTracker({ captured = [], style, layout='row' }) {
  const list = Object.keys(TREASURE_DATA);
  return (
    <div style={style}>
      <div className="fi-cap" style={{marginBottom:8}}>Treasures Captured</div>
      <div style={{display:'flex', gap:10, flexDirection: layout==='row'?'row':'column'}}>
        {list.map((t)=>{
          const d = TREASURE_DATA[t];
          const got = captured.includes(t);
          return (
            <div key={t} style={{
              flex:1, display:'flex', alignItems:'center', gap:8,
              padding:'8px 10px',
              borderRadius:8,
              background: got?'rgba(202,160,82,.12)':'rgba(8,22,28,.45)',
              border:`1px solid ${got?'var(--c-brass)':'rgba(202,160,82,.18)'}`,
              boxShadow: got?'0 0 14px rgba(232,196,122,.25)':'none',
            }}>
              <TreasureMark treasure={t} captured={got} size={26}/>
              <div style={{flex:1, minWidth:0}}>
                <div className="fi-display-i" style={{fontSize:12, color: got?'var(--c-brassHi)':'var(--c-sand2)', lineHeight:1.1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{d.name}</div>
                <div className="fi-mono" style={{fontSize:8.5, color: got?'var(--c-brass)':'rgba(232,212,166,.4)', letterSpacing:'.12em', textTransform:'uppercase'}}>
                  {got? '✓ Captured' : 'Uncaptured'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Turn indicator ─────────────────────────────────────────────────────
function TurnIndicator({ currentPlayer, role, actionsRemaining=3, isYou, phase='action', style }) {
  const r = role && ROLES_BY_ID[role];
  const color = r ? `var(--c-${r.colorVar})` : 'var(--c-brass)';
  const phaseLabel = {
    action: 'Action Phase',
    draw_treasure: 'Drawing Treasure',
    draw_flood: 'Drawing Flood',
    discard: 'Discarding',
    swim: 'Swim to Safety',
    waters_rise: 'Waters Rise!',
  }[phase] || phase;
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:14,
      padding:'10px 16px',
      background:'linear-gradient(90deg, rgba(20,48,56,.85), rgba(8,22,28,.85))',
      border:'1px solid rgba(202,160,82,.3)',
      borderRadius: 12,
      boxShadow:'var(--shadow-2)',
      ...style,
    }}>
      {role && <Pawn role={role} kind="portrait" size={42} isActive/>}
      <div style={{flex:1}}>
        <div className="fi-cap" style={{color: isYou?'var(--c-brassHi)':'var(--c-sand2)'}}>{phaseLabel}</div>
        <div className="fi-display" style={{fontSize:20, color: isYou?'var(--c-brassHi)':'var(--c-parch)', lineHeight:1.15}}>
          {isYou ? 'Your turn' : `${currentPlayer}'s turn`}
          {isYou && <span className="fi-display-i" style={{fontSize:14, marginLeft:8, color:'var(--c-sand)'}}>— take your move</span>}
        </div>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <div style={{display:'flex', gap:5}}>
          {[0,1,2].map(i=>(
            <div key={i} style={{
              width: 14, height: 14, borderRadius:'50%',
              background: i<actionsRemaining ? color : 'transparent',
              border:`1.5px solid ${i<actionsRemaining? color : 'rgba(202,160,82,.4)'}`,
              boxShadow: i<actionsRemaining? `0 0 10px ${color}80`:'none',
            }}/>
          ))}
        </div>
        <div className="fi-mono" style={{fontSize:10, color:'var(--c-sand2)', letterSpacing:'.1em'}}>
          {actionsRemaining} / 3
        </div>
      </div>
    </div>
  );
}

// ─── Action bar ─────────────────────────────────────────────────────────
const ACTION_DEFS = [
  { id:'move',     name:'Move',          glyph:'move',  hint:'1 tile · adjacent' },
  { id:'shore',    name:'Shore Up',      glyph:'shore', hint:'Flip flooded tile' },
  { id:'give',     name:'Give Card',     glyph:'give',  hint:'Same tile · 1 card' },
  { id:'capture',  name:'Capture',       glyph:'capt',  hint:'4 matching · on tile' },
  { id:'end',      name:'End Turn',      glyph:'end',   hint:'Pass to next' },
];
function ActionGlyph({ kind, size=24, color='currentColor' }) {
  const p = { width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:color,strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round'};
  switch(kind){
    case 'move':  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 4 L12 8 M12 16 L12 20 M4 12 L8 12 M16 12 L20 12"/><path d="M12 4 L10 6 M12 4 L14 6 M12 20 L10 18 M12 20 L14 18 M4 12 L6 10 M4 12 L6 14 M20 12 L18 10 M20 12 L18 14"/></svg>;
    case 'shore': return <svg {...p}><path d="M3 17 L21 17"/><path d="M3 13 Q9 9 12 13 T21 13"/><path d="M7 10 L7 6 M11 8 L11 4 M15 10 L15 6"/></svg>;
    case 'give':  return <svg {...p}><rect x="3" y="7" width="11" height="14" rx="1"/><rect x="10" y="3" width="11" height="14" rx="1"/></svg>;
    case 'capt':  return <svg {...p}><path d="M7 4 L17 4 L17 9 Q17 14 12 14 Q7 14 7 9 Z"/><path d="M12 14 L12 18 M8 20 L16 20"/><path d="M7 5 L4 5 Q4 9 7 9 M17 5 L20 5 Q20 9 17 9"/></svg>;
    case 'end':   return <svg {...p}><polygon points="6,4 18,12 6,20" fill={color} opacity=".7"/></svg>;
  }
}

function ActionBar({ available={move:true, shore:true, give:false, capture:false, end:true}, hint={capture:true}, activeMode, onSelect, style }) {
  return (
    <div style={{
      display:'flex', gap:8, padding:8,
      background:'linear-gradient(180deg, rgba(20,48,56,.9), rgba(8,22,28,.95))',
      border:'1px solid rgba(202,160,82,.35)',
      borderRadius:14,
      boxShadow:'var(--shadow-2)',
      ...style,
    }}>
      {ACTION_DEFS.map(a=>{
        const enabled = available[a.id];
        const active = activeMode === a.id;
        const glow = hint[a.id] && enabled;
        return (
          <button key={a.id} disabled={!enabled} onClick={()=>onSelect?.(a.id)} className="fi"
            style={{
              flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4,
              padding:'10px 6px',
              border:`1px solid ${active?'var(--c-brassHi)':'rgba(202,160,82,.2)'}`,
              borderRadius:10,
              background: active
                ? 'linear-gradient(180deg, rgba(232,196,122,.25), rgba(202,160,82,.08))'
                : 'rgba(8,22,28,.3)',
              color: enabled ? 'var(--c-parch)' : 'rgba(232,212,166,.3)',
              cursor: enabled?'pointer':'not-allowed',
              boxShadow: glow ? '0 0 0 1px var(--c-brassHi), 0 0 18px rgba(232,196,122,.5)':'none',
              animation: glow ? 'fi-pulse 1.6s ease-in-out infinite':'none',
              transition:'all .15s',
            }}>
            <ActionGlyph kind={a.glyph} size={22} color={active?'var(--c-brassHi)':'currentColor'}/>
            <div style={{fontFamily:'var(--ff-ui)', fontSize:11, fontWeight:600, letterSpacing:'.04em', textTransform:'uppercase'}}>{a.name}</div>
            <div className="fi-mono" style={{fontSize:8.5, color:'var(--c-sand2)', opacity: enabled?.85:.4, letterSpacing:'.06em'}}>{a.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Game log ───────────────────────────────────────────────────────────
function GameLog({ entries=[], style }) {
  return (
    <div style={style}>
      <div className="fi-cap" style={{marginBottom:6}}>Captain's Log</div>
      <div style={{
        display:'flex', flexDirection:'column', gap:4,
        maxHeight: 200, overflow:'hidden',
        padding: '8px 10px',
        background:'rgba(8,22,28,.5)',
        borderRadius:8,
        border:'1px solid rgba(202,160,82,.15)',
        fontSize:11, lineHeight:1.4,
      }}>
        {entries.map((e,i)=>(
          <div key={i} style={{display:'flex', gap:8, opacity: 1 - i*0.06}}>
            <span className="fi-mono" style={{fontSize:9, color:'var(--c-brassLo)', flexShrink:0, marginTop:2}}>
              T{e.turn||1}
            </span>
            <span style={{color: e.tone==='danger'?'#f0a89a':e.tone==='good'?'var(--c-brassHi)':'var(--c-sand)'}}>
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Island grid (diamond board) ────────────────────────────────────────
// Board mask — 6x6 grid w/ rows of 2-4-6-6-4-2 = 24 tiles, in diamond.
// 1 = playable cell, 0 = ocean.
const BOARD_MASK = [
  [0,0,1,1,0,0],
  [0,1,1,1,1,0],
  [1,1,1,1,1,1],
  [1,1,1,1,1,1],
  [0,1,1,1,1,0],
  [0,0,1,1,0,0],
];

// Sample tile layout — assigns 24 tiles to the 24 playable cells.
// (Engineer reference: server-side board-setup shuffles this; for design we
// use a representative arrangement so the named tiles are visible on every
// screenshot.)
const SAMPLE_LAYOUT = [
  ['temple_moon','temple_sun'],
  ['howling_garden','breakers_bridge','cliffs_abandon','whispering_garden'],
  ['bronze_gate','crimson_forest','dunes_deception','copper_gate','observatory','phantom_rock'],
  ['gold_gate','cave_embers','fools_landing','lost_lagoon','misty_marsh','iron_gate'],
  ['silver_gate','tidal_palace','twilight_hollow','coral_palace'],
  ['watchtower','cave_shadows'],
];

function flattenLayout(layout = SAMPLE_LAYOUT) {
  const tiles = [];
  let i = 0;
  layout.forEach((row, r) => {
    row.forEach((id) => {
      // find the col by scanning mask for the i-th 1 in row r
      // simpler: column positions in mask
      tiles.push({ id, row: r, col: -1 });
    });
  });
  // resolve cols
  let idx = 0;
  BOARD_MASK.forEach((row, r) => {
    const inRow = [];
    row.forEach((v,c)=>{ if(v) inRow.push(c); });
    layout[r].forEach((id, k) => { tiles[idx++].col = inRow[k]; });
  });
  return tiles;
}

function IslandGrid({
  tiles = flattenLayout(),
  states = {},           // tileId -> 'normal'|'flooded'|'sunk'
  targets = {},          // tileId -> 'move'|'shore'|'fly'|'swim'
  selected = null,       // tileId
  captured = [],         // [treasureType]
  dangerTiles = [],      // [tileId] (about to sink / treasure-loss warning)
  pawnsOnTile = {},      // tileId -> [<Pawn/>]
  tileSize = 100,
  gap = 8,
  showNames = true,
  onTileClick,
  style,
}) {
  const dimAll = false;
  return (
    <div style={{
      display:'inline-block',
      padding: 14,
      background: 'transparent',
      ...style,
    }}>
      <div style={{display:'flex', flexDirection:'column', gap}}>
        {BOARD_MASK.map((row, r)=>(
          <div key={r} style={{display:'flex', gap, justifyContent:'center'}}>
            {row.map((cell, c)=>{
              if (!cell) return <div key={c} style={{width:tileSize, height:tileSize}}/>;
              const t = tiles.find(x=>x.row===r && x.col===c);
              if (!t) return <div key={c} style={{width:tileSize, height:tileSize, opacity:.4, border:'1px dashed rgba(202,160,82,.2)', borderRadius:8}}/>;
              const tdef = TILES_BY_ID[t.id];
              const state = states[t.id] || 'normal';
              const isCapt = tdef.treasure && captured.includes(tdef.treasure);
              return (
                <Tile
                  key={t.id}
                  id={t.id}
                  state={state}
                  size={tileSize}
                  target={targets[t.id]}
                  selected={selected===t.id}
                  captured={isCapt}
                  danger={dangerTiles.includes(t.id)}
                  dim={dimAll}
                  showName={showNames}
                  pawns={pawnsOnTile[t.id] || []}
                  onClick={onTileClick?()=>onTileClick(t.id):undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Player roster panel ───────────────────────────────────────────────
function PlayerInfo({ name, role, isActive, isYou, handCount=0, isConnected=true, pawnKind='portrait' }) {
  const r = ROLES_BY_ID[role];
  const color = r?`var(--c-${r.colorVar})`:'var(--c-brass)';
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'8px 10px',
      borderRadius:10,
      background: isActive ? 'rgba(232,196,122,.1)' : 'rgba(8,22,28,.4)',
      border:`1px solid ${isActive?'var(--c-brass)':'rgba(202,160,82,.15)'}`,
      opacity: isConnected?1:0.55,
      position:'relative',
    }}>
      <Pawn role={role} kind={pawnKind} size={36} isActive={isActive}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'baseline', gap:6}}>
          <div className="fi-display" style={{fontSize:14, color:'var(--c-parch)', lineHeight:1, fontWeight: isYou?500:400}}>{name}{isYou && <span className="fi-cap" style={{marginLeft:6, color:'var(--c-brassHi)'}}>You</span>}</div>
        </div>
        <div className="fi-mono" style={{fontSize:9, color, letterSpacing:'.1em', textTransform:'uppercase', marginTop:2}}>
          {r?r.name:'—'} {!isConnected && '· offline'}
        </div>
      </div>
      <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2}}>
        <div className="fi-mono" style={{fontSize:9, color:'var(--c-sand2)'}}>HAND</div>
        <div style={{display:'flex', gap:1.5, alignItems:'center'}}>
          {[...Array(5)].map((_,i)=>(
            <div key={i} style={{
              width:5, height:9, borderRadius:1.5,
              background: i<handCount?'var(--c-brass)':'transparent',
              border: '1px solid rgba(202,160,82,.4)',
            }}/>
          ))}
          <span className="fi-mono" style={{fontSize:10, color: handCount>5?'var(--c-danger)':'var(--c-sand)', marginLeft:4, fontWeight:600}}>{handCount}</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  WATER_LEVELS, WaterMeter,
  TreasureTracker, TurnIndicator,
  ACTION_DEFS, ActionGlyph, ActionBar,
  GameLog, BOARD_MASK, SAMPLE_LAYOUT, flattenLayout, IslandGrid,
  PlayerInfo,
});
