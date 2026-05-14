// pieces-roles.jsx — Six adventurer roles + pawn portrait component.
//
// Pawn styles (selectable in Tweaks):
//   portrait — circular brass-ringed portrait placeholder (default)
//   chess    — colored chess-piece silhouette (top-down)
//   badge    — role glyph badge
//   gem      — colored gem with role glyph
//
// Per design rule we do NOT hand-draw faces; portraits use a tonal
// silhouette + brass ring + monospace ID to imply "this is where the
// painted character portrait goes".

const ROLES = [
  { id:'explorer',  name:'Explorer',  colorVar:'role_explorer', startTile:'copper_gate',
    ability:'Move and shore up diagonally (8-direction).' , glyph:'compass'},
  { id:'diver',     name:'Diver',     colorVar:'role_diver',    startTile:'iron_gate',
    ability:'Move through any number of flooded or sunk tiles to reach a tile.', glyph:'goggles' },
  { id:'engineer',  name:'Engineer',  colorVar:'role_engineer', startTile:'bronze_gate',
    ability:'Shore up two tiles for one action.', glyph:'gear' },
  { id:'pilot',     name:'Pilot',     colorVar:'role_pilot',    startTile:'fools_landing',
    ability:'Fly to any tile, once per turn (1 action).', glyph:'wings' },
  { id:'messenger', name:'Messenger', colorVar:'role_messenger',startTile:'silver_gate',
    ability:'Give Treasure cards to any player on any tile.', glyph:'envelope' },
  { id:'navigator', name:'Navigator', colorVar:'role_navigator',startTile:'gold_gate',
    ability:'Move another player up to two tiles for one action.', glyph:'rose' },
];
const ROLES_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r]));

// ─── Role glyphs ─────────────────────────────────────────────────────────
function RoleGlyph({ kind, size = 22, color = 'currentColor', strokeWidth = 1.4 }) {
  const p = { width: size, height: size, viewBox:'0 0 24 24', fill:'none', stroke: color, strokeWidth, strokeLinecap:'round', strokeLinejoin:'round' };
  switch (kind){
    case 'compass':
      return <svg {...p}><circle cx="12" cy="12" r="9"/><polygon points="12,5 14,12 12,19 10,12" fill={color} opacity=".7"/></svg>;
    case 'goggles':
      return <svg {...p}><circle cx="8" cy="12" r="3.4"/><circle cx="16" cy="12" r="3.4"/><path d="M11 12 L13 12 M4 10 Q4 6 8 8 M20 10 Q20 6 16 8"/></svg>;
    case 'gear':
      return <svg {...p}><circle cx="12" cy="12" r="3.4"/>{[...Array(8)].map((_,i)=>{const a=i*Math.PI/4;return <line key={i} x1={12+5*Math.cos(a)} y1={12+5*Math.sin(a)} x2={12+8*Math.cos(a)} y2={12+8*Math.sin(a)}/>;})}</svg>;
    case 'wings':
      return <svg {...p}><path d="M12 14 L4 8 Q8 14 12 14 Z" fill={color} opacity=".7"/><path d="M12 14 L20 8 Q16 14 12 14 Z" fill={color} opacity=".7"/><circle cx="12" cy="15" r="1.6"/></svg>;
    case 'envelope':
      return <svg {...p}><rect x="3" y="7" width="18" height="11" rx="1"/><path d="M3 8 L12 14 L21 8"/></svg>;
    case 'rose':
      return <svg {...p}><polygon points="12,3 14,12 12,21 10,12" fill={color} opacity=".7"/><polygon points="3,12 12,10 21,12 12,14" fill={color} opacity=".7"/></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="5"/></svg>;
  }
}

// ─── Pawn ────────────────────────────────────────────────────────────────
// kind: 'portrait' | 'chess' | 'badge' | 'gem'
// size: outer diameter px
// isActive: pulsing turn indicator ring
function Pawn({ role, kind = 'portrait', size = 30, isActive, dim, style }) {
  const r = ROLES_BY_ID[role];
  if (!r) return null;
  const color = `var(--c-${r.colorVar})`;
  const contrast = (role === 'diver') ? 'var(--c-parch)'
                  : (role === 'messenger') ? 'var(--c-inkText)'
                  : '#fff';

  const halo = isActive
    ? { boxShadow: `0 0 0 2px var(--c-brassHi), 0 0 18px ${color}` , animation:'fi-pulse 1.6s ease-in-out infinite'}
    : {};

  if (kind === 'badge') {
    return (
      <div style={{ width:size, height:size, borderRadius:6, background:color,
        display:'flex',alignItems:'center',justifyContent:'center',
        border:'1px solid rgba(0,0,0,.35)',
        boxShadow:'0 1px 0 rgba(255,255,255,.25) inset, 0 4px 10px rgba(0,0,0,.45)',
        ...halo, ...style, filter: dim?'saturate(.3) brightness(.6)':'none' }}>
        <RoleGlyph kind={r.glyph} size={Math.round(size*0.6)} color={contrast}/>
      </div>
    );
  }
  if (kind === 'chess') {
    // top-down silhouette: domed cap with a darker pedestal
    return (
      <div style={{position:'relative', width:size, height:size, ...style, filter: dim?'saturate(.3) brightness(.6)':'none'}}>
        <div style={{
          position:'absolute', inset:'10% 18% 18% 18%', borderRadius:'50%',
          background:`radial-gradient(circle at 35% 30%, ${color} 0%, ${color} 50%, rgba(0,0,0,.6) 100%)`,
          border:'1px solid rgba(0,0,0,.55)',
          boxShadow:'0 6px 10px rgba(0,0,0,.45)',
          ...halo,
        }}/>
        <div style={{
          position:'absolute', left:'12%', right:'12%', bottom:'4%', height:'18%',
          borderRadius:'50%', background:'rgba(0,0,0,.45)', filter:'blur(2px)'
        }}/>
      </div>
    );
  }
  if (kind === 'gem') {
    return (
      <div style={{position:'relative', width:size, height:size, ...style, filter: dim?'saturate(.3) brightness(.6)':'none'}}>
        <svg viewBox="0 0 40 40" width={size} height={size}>
          <polygon points="20,4 36,16 28,36 12,36 4,16" fill={color} stroke="rgba(0,0,0,.5)" strokeWidth="1"/>
          <polygon points="20,4 36,16 20,18 4,16" fill="rgba(255,255,255,.25)"/>
          <polygon points="20,18 28,36 12,36" fill="rgba(0,0,0,.25)"/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <RoleGlyph kind={r.glyph} size={Math.round(size*0.4)} color={contrast}/>
        </div>
        {isActive && <div style={{position:'absolute',inset:-4,borderRadius:'50%',boxShadow:`0 0 0 2px var(--c-brassHi), 0 0 18px ${color}`,animation:'fi-pulse 1.6s ease-in-out infinite'}}/>}
      </div>
    );
  }
  // portrait (default): brass ring + tonal silhouette placeholder
  return (
    <div style={{
      position:'relative', width:size, height:size, borderRadius:'50%',
      background:`linear-gradient(180deg, var(--c-brassHi) 0%, var(--c-brass) 50%, var(--c-brassLo) 100%)`,
      padding:2,
      boxShadow:'0 1px 0 rgba(255,255,255,.4) inset, 0 4px 10px rgba(0,0,0,.5)',
      filter: dim?'saturate(.3) brightness(.6)':'none',
      ...halo, ...style,
    }}>
      <div style={{
        width:'100%', height:'100%', borderRadius:'50%', overflow:'hidden', position:'relative',
        background: `radial-gradient(120% 100% at 40% 25%, ${color} 0%, color-mix(in oklab, ${color} 40%, var(--c-ink)) 100%)`,
        boxShadow:`inset 0 0 0 1px rgba(0,0,0,.5), inset 0 -8px 14px rgba(0,0,0,.45)`,
      }}>
        {/* tonal head silhouette */}
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <circle cx="20" cy="15" r="6" fill="rgba(0,0,0,.35)"/>
          <path d="M6 38 Q6 24 20 24 Q34 24 34 38 Z" fill="rgba(0,0,0,.4)"/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'52%'}}>
          <RoleGlyph kind={r.glyph} size={Math.round(size*0.28)} color={contrast} strokeWidth={1.6}/>
        </div>
      </div>
    </div>
  );
}

// ─── RoleCard — for waiting room role select & game sidebar ──────────────
function RoleCard({ role, pawnKind='portrait', claimedBy, isMe, available=true, compact, onClick, selected }) {
  const r = ROLES_BY_ID[role];
  if (!r) return null;
  const color = `var(--c-${r.colorVar})`;
  return (
    <div onClick={available?onClick:undefined}
      style={{
        position:'relative',
        padding: compact ? '10px 12px' : 14,
        borderRadius: 12,
        background:
          selected ? 'linear-gradient(180deg, rgba(232,196,122,.15), rgba(202,160,82,.06))'
                   : 'rgba(20,48,56,.5)',
        border: `1px solid ${selected ? 'var(--c-brass)' : 'rgba(202,160,82,.2)'}`,
        boxShadow: selected
          ? '0 0 0 1px var(--c-brassHi), 0 10px 22px rgba(0,0,0,.4)'
          : '0 1px 0 rgba(255,255,255,.04) inset, 0 4px 14px rgba(0,0,0,.35)',
        cursor: available?'pointer':'not-allowed',
        opacity: available ? 1 : 0.55,
        display:'flex', alignItems:'center', gap: 12,
        transition:'transform .15s, box-shadow .15s',
      }}>
      <Pawn role={r.id} kind={pawnKind} size={compact?34:42}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex',alignItems:'baseline',gap:8}}>
          <div className="fi-display" style={{fontSize: compact?15:17, color:'var(--c-parch)'}}>{r.name}</div>
          <div style={{width:7,height:7,borderRadius:'50%',background:color,boxShadow:`0 0 8px ${color}`}}/>
        </div>
        {!compact && (
          <div style={{fontSize:11, color:'var(--c-sand2)', marginTop:3, lineHeight:1.4}}>{r.ability}</div>
        )}
        {claimedBy && (
          <div className="fi-mono" style={{fontSize:9.5,marginTop:4,letterSpacing:'.1em',textTransform:'uppercase',
            color: isMe?'var(--c-brassHi)':'var(--c-sand2)'}}>
            {isMe ? '✓ YOU' : `Claimed · ${claimedBy}`}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ROLES, ROLES_BY_ID, Pawn, RoleCard, RoleGlyph });
