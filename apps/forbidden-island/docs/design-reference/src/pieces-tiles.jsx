// pieces-tiles.jsx — Tile component + 24-tile catalog with placeholder art
//
// Each tile is rendered as a small "miniature painting": a custom radial
// gradient ground in tile-specific hues, a centered geometric glyph that
// hints at the named scene, and a small monospace ID at the corner.
// States:
//   normal  → full color, slight warmth
//   flooded → blue wash overlay + ripple lines (tile tilted slightly)
//   sunk    → empty ocean cell with crack rim where it sank
//
// Tile IDs map to the 24 DESIGN.md tile names.

// ─── Tile catalog ────────────────────────────────────────────────────────
// hue1/hue2 = gradient stops (oklch hue references via plain hex), glyph is
// a render-fn that draws a SIMPLE geometric symbol.

const TILES = [
  // Treasures - Earth Stone
  { id:'temple_moon', name:'Temple of the Moon',     hue1:'#3a3a72', hue2:'#1c1840', glyph:'moon',     treasure:'earth_stone' },
  { id:'temple_sun',  name:'Temple of the Sun',      hue1:'#e9a04a', hue2:'#a45c1c', glyph:'sun',      treasure:'earth_stone' },
  // Statue of the Wind
  { id:'howling_garden',  name:'Howling Garden',     hue1:'#7a9c5e', hue2:'#34522e', glyph:'spiral',   treasure:'statue_of_wind' },
  { id:'whispering_garden',name:'Whispering Garden', hue1:'#9bb87e', hue2:'#4a6a3a', glyph:'leaf',     treasure:'statue_of_wind' },
  // Crystal of Fire
  { id:'cave_embers', name:'Cave of Embers',         hue1:'#c25a2a', hue2:'#4a1810', glyph:'flame',    treasure:'crystal_of_fire' },
  { id:'cave_shadows',name:'Cave of Shadows',        hue1:'#2c1e30', hue2:'#0c0612', glyph:'arch',     treasure:'crystal_of_fire' },
  // Ocean's Chalice
  { id:'coral_palace',name:'Coral Palace',           hue1:'#d76e6a', hue2:'#722a2a', glyph:'chalice',  treasure:'oceans_chalice' },
  { id:'tidal_palace',name:'Tidal Palace',           hue1:'#3aa0b8', hue2:'#0c4e60', glyph:'wave',     treasure:'oceans_chalice' },
  // Gates (5)
  { id:'bronze_gate', name:'Bronze Gate', hue1:'#a55c2c', hue2:'#3d1f0e', glyph:'gate', gate:'engineer'  },
  { id:'copper_gate', name:'Copper Gate', hue1:'#c47a4c', hue2:'#4a2814', glyph:'gate', gate:'explorer'  },
  { id:'gold_gate',   name:'Gold Gate',   hue1:'#dfb555', hue2:'#5e421c', glyph:'gate', gate:'navigator' },
  { id:'iron_gate',   name:'Iron Gate',   hue1:'#7a8086', hue2:'#2a2e34', glyph:'gate', gate:'diver'     },
  { id:'silver_gate', name:'Silver Gate', hue1:'#c5c5c5', hue2:'#5e5e5e', glyph:'gate', gate:'messenger' },
  // Fools' Landing
  { id:'fools_landing',name:"Fools' Landing", hue1:'#e8c47a', hue2:'#6a4a1c', glyph:'helipad', special:'landing' },
  // Other 10
  { id:'breakers_bridge',name:'Breakers Bridge',  hue1:'#9c8264', hue2:'#3e2e1e', glyph:'bridge'    },
  { id:'cliffs_abandon', name:'Cliffs of Abandon',hue1:'#7a6a5e', hue2:'#2c241e', glyph:'cliff'     },
  { id:'crimson_forest', name:'Crimson Forest',   hue1:'#8a3a2c', hue2:'#3a120c', glyph:'forest'    },
  { id:'dunes_deception',name:'Dunes of Deception',hue1:'#deba7a', hue2:'#6c4a22', glyph:'dunes'    },
  { id:'lost_lagoon',    name:'Lost Lagoon',     hue1:'#4ab0a4', hue2:'#0c4844', glyph:'lagoon'    },
  { id:'misty_marsh',    name:'Misty Marsh',     hue1:'#7e8c80', hue2:'#2c3c34', glyph:'marsh'     },
  { id:'observatory',    name:'Observatory',     hue1:'#3a4068', hue2:'#10142c', glyph:'star'      },
  { id:'phantom_rock',   name:'Phantom Rock',    hue1:'#605870', hue2:'#1c1828', glyph:'monolith'  },
  { id:'twilight_hollow',name:'Twilight Hollow', hue1:'#4a3a5c', hue2:'#181020', glyph:'hollow'    },
  { id:'watchtower',     name:'Watchtower',      hue1:'#866844', hue2:'#2c1c10', glyph:'tower'     },
];

const TILES_BY_ID = Object.fromEntries(TILES.map((t) => [t.id, t]));

// ─── Tile glyphs ─────────────────────────────────────────────────────────
// Allowed to draw simple geometric shapes per design rules.
function TileGlyph({ kind, size = 38, color = 'rgba(255,240,210,.85)' }) {
  const c = color;
  const sw = 1.4;
  const props = { width: size, height: size, viewBox: '0 0 40 40', fill: 'none', stroke: c, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (kind) {
    case 'sun':
      return (<svg {...props}><circle cx="20" cy="20" r="6" fill={c} opacity=".8" />{[...Array(8)].map((_,i)=>{const a=i*Math.PI/4;return <line key={i} x1={20+10*Math.cos(a)} y1={20+10*Math.sin(a)} x2={20+14*Math.cos(a)} y2={20+14*Math.sin(a)}/>;})}</svg>);
    case 'moon':
      return (<svg {...props}><path d="M26 12 A10 10 0 1 0 26 28 A8 8 0 1 1 26 12 Z" fill={c} opacity=".8"/></svg>);
    case 'spiral':
      return (<svg {...props}><path d="M20 20 m0 0 a3 3 0 1 0 4 -4 a6 6 0 1 0 -8 8 a9 9 0 1 0 12 -12"/></svg>);
    case 'leaf':
      return (<svg {...props}><path d="M10 30 Q12 14 30 10 Q28 28 10 30 Z"/><line x1="10" y1="30" x2="22" y2="18"/></svg>);
    case 'flame':
      return (<svg {...props}><path d="M20 8 Q26 16 24 22 Q28 24 26 30 Q22 34 20 32 Q18 34 14 30 Q12 24 16 22 Q14 16 20 8 Z" fill={c} opacity=".7"/></svg>);
    case 'arch':
      return (<svg {...props}><path d="M8 32 L8 22 Q20 6 32 22 L32 32 Z" fill={c} opacity=".25"/><path d="M8 32 L8 22 Q20 6 32 22 L32 32"/></svg>);
    case 'chalice':
      return (<svg {...props}><path d="M12 12 L28 12 Q28 22 20 24 Q12 22 12 12 Z" fill={c} opacity=".6"/><line x1="20" y1="24" x2="20" y2="30"/><line x1="14" y1="32" x2="26" y2="32"/></svg>);
    case 'wave':
      return (<svg {...props}><path d="M6 22 Q12 14 18 22 T30 22 T34 22"/><path d="M6 28 Q12 20 18 28 T30 28 T34 28" opacity=".6"/></svg>);
    case 'gate':
      return (<svg {...props}><rect x="10" y="14" width="20" height="20" fill="none"/><path d="M10 18 L30 18 M14 14 L14 10 L26 10 L26 14"/></svg>);
    case 'helipad':
      return (<svg {...props}><circle cx="20" cy="20" r="13" fill="none"/><path d="M13 13 L13 27 M27 13 L27 27 M13 20 L27 20" /></svg>);
    case 'bridge':
      return (<svg {...props}><path d="M4 22 Q20 8 36 22"/><line x1="4" y1="22" x2="4" y2="32"/><line x1="36" y1="22" x2="36" y2="32"/><line x1="20" y1="15" x2="20" y2="32"/></svg>);
    case 'cliff':
      return (<svg {...props}><path d="M4 32 L4 22 L12 22 L12 14 L22 14 L22 8 L34 8 L34 32 Z" fill={c} opacity=".25"/><path d="M4 32 L4 22 L12 22 L12 14 L22 14 L22 8 L34 8"/></svg>);
    case 'forest':
      return (<svg {...props}><path d="M12 28 L8 18 L11 18 L9 12 L15 18 L13 18 L16 28 Z" fill={c} opacity=".6"/><path d="M26 30 L22 18 L25 18 L23 10 L30 18 L28 18 L31 30 Z" fill={c} opacity=".6"/></svg>);
    case 'dunes':
      return (<svg {...props}><path d="M4 28 Q12 18 20 24 Q28 30 36 22"/><path d="M4 22 Q12 14 20 18 Q28 22 36 16" opacity=".6"/></svg>);
    case 'lagoon':
      return (<svg {...props}><ellipse cx="20" cy="22" rx="14" ry="8" fill={c} opacity=".4"/><ellipse cx="20" cy="22" rx="14" ry="8"/></svg>);
    case 'marsh':
      return (<svg {...props}><line x1="8" y1="32" x2="8" y2="20"/><line x1="14" y1="32" x2="14" y2="14"/><line x1="20" y1="32" x2="20" y2="10"/><line x1="26" y1="32" x2="26" y2="16"/><line x1="32" y1="32" x2="32" y2="22"/></svg>);
    case 'star':
      return (<svg {...props}><circle cx="20" cy="22" r="10" fill="none"/><circle cx="20" cy="22" r="2" fill={c}/><circle cx="13" cy="14" r="1" fill={c}/><circle cx="28" cy="11" r="1.4" fill={c}/><circle cx="30" cy="26" r="1" fill={c}/></svg>);
    case 'monolith':
      return (<svg {...props}><rect x="15" y="6" width="10" height="28" fill={c} opacity=".3"/><rect x="15" y="6" width="10" height="28"/></svg>);
    case 'hollow':
      return (<svg {...props}><path d="M8 32 Q8 12 20 12 Q32 12 32 32 Z" fill={c} opacity=".2"/><path d="M8 32 Q8 12 20 12 Q32 12 32 32"/><circle cx="20" cy="22" r="3" fill={c} opacity=".6"/></svg>);
    case 'tower':
      return (<svg {...props}><rect x="16" y="10" width="8" height="24"/><rect x="14" y="8" width="12" height="4"/><line x1="20" y1="10" x2="20" y2="6"/></svg>);
    default:
      return <svg {...props}><circle cx="20" cy="20" r="6"/></svg>;
  }
}

// ─── Cracked overlay (for sunk + sinking states) ─────────────────────────
function CrackOverlay({ severity = 1, color = 'rgba(8,22,28,.8)' }) {
  const lines = [
    'M10 50 L40 35 L55 60 L80 40 L120 70',
    'M55 60 L70 90',
    'M40 35 L20 10',
    'M80 40 L100 15',
  ].slice(0, 2 + Math.round(severity * 2));
  return (
    <svg viewBox="0 0 120 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width:'100%', height:'100%', pointerEvents:'none', opacity: 0.6 + 0.4*severity }}>
      {lines.map((d,i)=>(<path key={i} d={d} stroke={color} strokeWidth={1.4 + severity} fill="none" strokeLinecap="round"/>))}
    </svg>
  );
}

// ─── Tile component ──────────────────────────────────────────────────────
// state: 'normal' | 'flooded' | 'sunk'
// target: 'move' | 'shore' | 'fly' | 'swim' | null  (highlight tone)
function Tile({ id, state = 'normal', size = 110, target, selected, pawns = [], showName = true, captured, danger, dim, style, onClick }) {
  const t = TILES_BY_ID[id];
  if (!t) return null;
  const isSunk = state === 'sunk';
  const isFlooded = state === 'flooded';

  const targetGlow = {
    move:  '0 0 0 2px var(--c-leaf), 0 0 24px rgba(94,138,58,.6)',
    shore: '0 0 0 2px var(--c-brassHi), 0 0 24px rgba(232,196,122,.6)',
    fly:   '0 0 0 2px var(--c-seaHi), 0 0 30px rgba(58,151,168,.7)',
    swim:  '0 0 0 2px var(--c-flame), 0 0 28px rgba(224,113,64,.7)',
    give:  '0 0 0 2px #d6c4e8, 0 0 24px rgba(214,196,232,.5)',
  };

  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size,
        position: 'relative',
        borderRadius: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform .15s, box-shadow .2s',
        transform: isFlooded ? 'rotate(-1.2deg)' : 'none',
        ...style,
      }}
    >
      {/* SUNK CELL: empty ocean with cracked rim */}
      {isSunk ? (
        <div
          style={{
            width:'100%', height:'100%', borderRadius:10,
            background:
              'radial-gradient(80% 80% at 50% 50%, var(--c-ink) 0%, var(--c-ink2) 70%, transparent 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(202,160,82,.18), inset 0 6px 16px rgba(0,0,0,.55)',
            position:'relative', overflow:'hidden',
          }}
        >
          {/* ripple lines on water */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:.4}}>
            <path d="M10 40 Q25 30 50 40 T90 40" stroke="rgba(58,151,168,.6)" strokeWidth=".8" fill="none"/>
            <path d="M10 60 Q25 50 50 60 T90 60" stroke="rgba(58,151,168,.4)" strokeWidth=".8" fill="none"/>
            <path d="M10 78 Q25 68 50 78 T90 78" stroke="rgba(58,151,168,.3)" strokeWidth=".8" fill="none"/>
          </svg>
          {/* fragment marks at rim */}
          <CrackOverlay severity={1} color="rgba(202,160,82,.5)" />
          <div className="fi-mono" style={{position:'absolute',bottom:6,left:0,right:0,textAlign:'center',fontSize:8,color:'rgba(202,160,82,.5)',letterSpacing:'.15em'}}>
            SUNK
          </div>
        </div>
      ) : (
        <>
          {/* Painted ground */}
          <div
            style={{
              position:'absolute', inset:0, borderRadius:10, overflow:'hidden',
              background: `radial-gradient(130% 100% at 30% 20%, ${t.hue1} 0%, ${t.hue2} 90%)`,
              boxShadow:
                `inset 0 0 0 1px rgba(202,160,82,${selected?0.8:0.35}), inset 0 1px 0 rgba(255,255,255,.08), inset 0 -16px 30px rgba(0,0,0,.35)`,
              filter: dim ? 'saturate(.4) brightness(.6)' : 'none',
            }}
          >
            {/* atmospheric haze */}
            <div style={{position:'absolute',inset:0,background:'radial-gradient(150% 60% at 50% 110%, rgba(255,240,210,.18) 0%, transparent 60%)'}}/>
            {/* paper texture */}
            <div aria-hidden style={{position:'absolute',inset:0,backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.8' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.25'/></svg>\")",mixBlendMode:'overlay',opacity:.6}}/>
            {/* glyph */}
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <TileGlyph kind={t.glyph} size={Math.round(size*0.42)} />
            </div>
            {/* flood blue wash */}
            {isFlooded && (
              <div style={{
                position:'absolute', inset:0,
                background:'linear-gradient(180deg, rgba(58,151,168,.25) 0%, rgba(26,77,90,.65) 100%)',
                mixBlendMode:'multiply',
              }}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:.7}}>
                  <path d="M-5 75 Q15 65 35 75 T75 75 T115 75" stroke="rgba(150,210,220,.7)" strokeWidth=".8" fill="none"/>
                  <path d="M-5 85 Q15 75 35 85 T75 85 T115 85" stroke="rgba(150,210,220,.5)" strokeWidth=".8" fill="none"/>
                </svg>
              </div>
            )}
            {/* cracking — appears on flooded as well, lighter */}
            {isFlooded && <CrackOverlay severity={0.4} />}

            {/* gate badge for gate tiles */}
            {t.gate && (
              <div style={{position:'absolute',top:5,left:6}}>
                <span style={{
                  fontFamily:'var(--ff-mono)',fontSize:8,letterSpacing:'.1em',padding:'1px 5px',
                  borderRadius:3,background:'rgba(8,22,28,.5)',color:'var(--c-sand)',
                  border:'1px solid rgba(202,160,82,.4)', textTransform:'uppercase'
                }}>{t.gate}</span>
              </div>
            )}
            {/* treasure marker */}
            {t.treasure && (
              <div style={{position:'absolute',top:5,right:6,display:'flex',alignItems:'center',gap:3}}>
                <TreasureMark treasure={t.treasure} captured={captured} size={14}/>
              </div>
            )}
            {/* helipad marker */}
            {t.special === 'landing' && (
              <div style={{position:'absolute',top:5,right:6}}>
                <span className="fi-mono" style={{fontSize:8,letterSpacing:'.1em',color:'var(--c-ink)',padding:'1px 4px',background:'var(--c-brassHi)',borderRadius:3,fontWeight:600}}>HELIPAD</span>
              </div>
            )}

            {/* danger pulse */}
            {danger && (
              <div style={{position:'absolute',inset:0,boxShadow:'inset 0 0 0 2px var(--c-danger), inset 0 0 22px rgba(201,82,58,.5)',borderRadius:10,animation:'fi-pulse 1.4s ease-in-out infinite'}}/>
            )}
          </div>

          {/* tile name */}
          {showName && (
            <div style={{
              position:'absolute', left:0,right:0, bottom: 6,
              textAlign:'center', padding:'0 6px',
              fontFamily:'var(--ff-display)', fontSize: Math.max(9, Math.round(size*0.105)),
              fontStyle:'italic', color:'rgba(255,240,210,.95)',
              textShadow:'0 1px 2px rgba(0,0,0,.7), 0 0 8px rgba(0,0,0,.4)',
              lineHeight:1.05,
              letterSpacing:'.01em',
            }}>{t.name}</div>
          )}

          {/* target highlight */}
          {target && (
            <div style={{position:'absolute',inset:-3, borderRadius:12, boxShadow: targetGlow[target], pointerEvents:'none', animation:'fi-glow 1.6s ease-in-out infinite'}}/>
          )}
        </>
      )}

      {/* pawn cluster */}
      {pawns.length > 0 && (
        <div style={{position:'absolute', bottom: -8, left:0, right:0, display:'flex', justifyContent:'center', gap:-6, zIndex:2}}>
          {pawns.map((p,i)=>(
            <div key={i} style={{marginLeft: i===0?0:-8}}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Treasure marker (small icon used on tile corner) ────────────────────
const TREASURE_DATA = {
  earth_stone:     { name: 'The Earth Stone',     color: '#7aa544', glyph:'stone'    },
  statue_of_wind:  { name: 'The Statue of the Wind', color: '#c9c0a0', glyph:'wind'  },
  crystal_of_fire: { name: 'The Crystal of Fire', color: '#e07140', glyph:'fire'     },
  oceans_chalice:  { name: "The Ocean's Chalice", color: '#3ba0c0', glyph:'chalice2' },
};
function TreasureMark({ treasure, captured, size = 22 }) {
  const d = TREASURE_DATA[treasure];
  if (!d) return null;
  return (
    <div title={d.name} style={{
      width: size, height: size, borderRadius: '50%',
      background: captured
        ? `radial-gradient(circle at 35% 35%, ${d.color} 0%, var(--c-brassLo) 100%)`
        : 'rgba(8,22,28,.6)',
      border: `1px solid ${captured ? '#fff5d8' : d.color}`,
      display:'flex', alignItems:'center', justifyContent:'center',
      boxShadow: captured ? `0 0 12px ${d.color}88` : 'none',
    }}>
      <TreasureGlyph kind={d.glyph} size={Math.round(size*0.6)} color={captured?'var(--c-ink)':d.color}/>
    </div>
  );
}
function TreasureGlyph({ kind, size, color }) {
  const p = { width: size, height: size, viewBox:'0 0 20 20', fill:'none', stroke: color, strokeWidth: 1.4 };
  switch(kind){
    case 'stone':  return <svg {...p}><polygon points="10,3 17,10 10,17 3,10" fill={color} opacity=".8"/></svg>;
    case 'wind':   return <svg {...p}><path d="M3 8 Q10 4 17 8 M3 12 Q10 8 17 12"/></svg>;
    case 'fire':   return <svg {...p}><path d="M10 3 Q14 8 12 12 Q15 13 13 17 Q10 18 10 16 Q8 18 7 14 Q9 12 7 9 Q10 7 10 3 Z" fill={color} opacity=".7"/></svg>;
    case 'chalice2': return <svg {...p}><path d="M5 5 L15 5 Q15 10 10 11 L10 15 M6 17 L14 17"/></svg>;
  }
}

// ─── Pulse animations ────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('fi-anims')) {
  const s = document.createElement('style');
  s.id = 'fi-anims';
  s.textContent = `
    @keyframes fi-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
    @keyframes fi-glow  { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.3)} }
    @keyframes fi-bob   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
    @keyframes fi-wave-up { 0%{transform:translateY(20px);opacity:0} 100%{transform:translateY(0);opacity:1} }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { TILES, TILES_BY_ID, Tile, TileGlyph, TreasureMark, TreasureGlyph, TREASURE_DATA, CrackOverlay });
