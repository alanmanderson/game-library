// screen-endings.jsx — Game-over screens (Win + 4 loss reasons),
// disconnect / reconnect states.

// ─── Generic ending shell ──────────────────────────────────────────────
function EndingShell({ width=1200, height=820, tone='victory', children, style }) {
  const tones = {
    victory: {
      bg: `radial-gradient(80% 60% at 50% 20%, rgba(232,196,122,.22) 0%, transparent 60%),
           radial-gradient(60% 50% at 50% 90%, rgba(58,151,168,.16) 0%, transparent 70%),
           linear-gradient(180deg, var(--c-ink) 0%, var(--c-ink2) 100%)`,
      ring: 'var(--c-brassHi)',
    },
    defeat: {
      bg: `radial-gradient(70% 50% at 50% 30%, rgba(201,82,58,.16) 0%, transparent 70%),
           linear-gradient(180deg, var(--c-ink) 0%, #1a0c0a 100%)`,
      ring: 'var(--c-danger)',
    },
  }[tone];
  return (
    <div style={{width, height, position:'relative', overflow:'hidden', color:'var(--c-parch)',
      fontFamily:'var(--ff-ui)', background: tones.bg, ...style}}>
      {/* paper grain */}
      <div aria-hidden style={{position:'absolute',inset:0,
        backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.15'/></svg>\")",
        mixBlendMode:'overlay', opacity:.6}}/>
      {/* gilt frame */}
      <div style={{position:'absolute', inset:24, border:`1px solid ${tones.ring}`, borderRadius:14, pointerEvents:'none', boxShadow:`0 0 60px ${tones.ring}33 inset`}}/>
      <div style={{position:'absolute', top:18, left:30}}>
        <CornerFiligree size={28} color={tones.ring}/>
      </div>
      <div style={{position:'absolute', top:18, right:30, transform:'scaleX(-1)'}}>
        <CornerFiligree size={28} color={tones.ring}/>
      </div>
      <div style={{position:'absolute', bottom:18, left:30, transform:'scaleY(-1)'}}>
        <CornerFiligree size={28} color={tones.ring}/>
      </div>
      <div style={{position:'absolute', bottom:18, right:30, transform:'scale(-1)'}}>
        <CornerFiligree size={28} color={tones.ring}/>
      </div>
      <div style={{position:'relative', height:'100%'}}>{children}</div>
    </div>
  );
}

// ─── Win screen ─────────────────────────────────────────────────────────
function WinScreen({ width=1200, height=820, pawnKind='portrait', style }) {
  const players = [
    { name:'Camille', role:'pilot' },
    { name:'Wren',    role:'engineer' },
    { name:'Tomás',   role:'navigator' },
    { name:'Jules',   role:'diver' },
  ];
  return (
    <EndingShell width={width} height={height} tone="victory" style={style}>
      <div style={{height:'100%', display:'grid', gridTemplateRows:'auto 1fr auto', padding:'60px 80px 40px'}}>
        {/* hero */}
        <div style={{textAlign:'center'}}>
          <div className="fi-mono" style={{fontSize:11, letterSpacing:'.4em', color:'var(--c-brass)'}}>EXPEDITION CONCLUDED</div>
          <div className="fi-display-i" style={{fontSize:18, marginTop:8, color:'var(--c-sand)'}}>The sea closes over what remains.</div>
          <div className="fi-display" style={{fontSize:82, marginTop:14, color:'var(--c-parch)', letterSpacing:'-.01em', lineHeight:1}}>
            You <span className="fi-display-i" style={{color:'var(--c-brassHi)'}}>escaped</span>.
          </div>
        </div>
        {/* helicopter scene */}
        <div style={{position:'relative', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:30}}>
          <div style={{position:'relative', width:520, height: 240}}>
            {/* horizon */}
            <div style={{position:'absolute', bottom:0, left:0, right:0, height: 50,
              background:'linear-gradient(180deg, transparent, rgba(58,151,168,.4))',
              borderTop:'1px solid var(--c-seaHi)',
            }}/>
            {/* tiny disappearing island */}
            <div style={{position:'absolute', bottom: 18, left:'18%',
              width: 70, height:14, background:'radial-gradient(60% 100% at 50% 0%, rgba(202,160,82,.3), transparent)',
              borderRadius:'50% 50% 0 0', opacity:.6}}/>
            {/* helicopter */}
            <div style={{position:'absolute', top:30, right:24, animation:'fi-bob 2.4s ease-in-out infinite'}}>
              <svg viewBox="0 0 200 100" width={220} height={110}>
                <line x1="20" y1="22" x2="180" y2="22" stroke="var(--c-brassHi)" strokeWidth="3"/>
                <ellipse cx="100" cy="55" rx="60" ry="18" fill="var(--c-ink2)" stroke="var(--c-brassHi)" strokeWidth="1.5"/>
                <rect x="92" y="22" width="6" height="34" fill="var(--c-ink2)"/>
                <path d="M150 55 L188 44 L188 52 Z" fill="var(--c-ink2)" stroke="var(--c-brassHi)" strokeWidth="1"/>
                <line x1="60" y1="78" x2="140" y2="78" stroke="var(--c-brassHi)" strokeWidth="2"/>
                <line x1="65" y1="68" x2="65" y2="78" stroke="var(--c-brassHi)" strokeWidth="2"/>
                <line x1="135" y1="68" x2="135" y2="78" stroke="var(--c-brassHi)" strokeWidth="2"/>
                <ellipse cx="80" cy="50" rx="14" ry="6" fill="var(--c-brassHi)" opacity=".7"/>
                <ellipse cx="115" cy="50" rx="14" ry="6" fill="var(--c-brassHi)" opacity=".7"/>
              </svg>
            </div>
            {/* trailing pawns inside helicopter (decorative) */}
            <div style={{position:'absolute', top:48, right:80, display:'flex', gap:-8}}>
              {players.map((p,i)=>(
                <div key={p.name} style={{marginLeft:i===0?0:-10, transform:`translateY(${(i%2)*-3}px)`}}>
                  <Pawn role={p.role} kind={pawnKind} size={22}/>
                </div>
              ))}
            </div>
          </div>
          {/* treasures collected */}
          <div style={{display:'flex', gap:16}}>
            {Object.keys(TREASURE_DATA).map(t=>(
              <div key={t} style={{textAlign:'center'}}>
                <TreasureMark treasure={t} captured size={56}/>
                <div className="fi-display-i" style={{fontSize:13, color:'var(--c-brassHi)', marginTop:6, letterSpacing:'.02em'}}>{TREASURE_DATA[t].name}</div>
              </div>
            ))}
          </div>
        </div>
        {/* footer stats */}
        <div>
          <hr className="fi-hr"/>
          <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginTop:14}}>
            <Stat label="Turns Played" value="14"/>
            <Stat label="Tiles Remaining" value="11 / 24"/>
            <Stat label="Final Water" value="6 · Draw 4"/>
            <Stat label="Difficulty" value="Normal"/>
            <Stat label="Treasures" value="4 / 4"/>
          </div>
          <div style={{marginTop:18, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{display:'flex', gap:10}}>
              {players.map(p=>(
                <div key={p.name} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:'rgba(8,22,28,.4)',borderRadius:18,border:'1px solid rgba(202,160,82,.2)'}}>
                  <Pawn role={p.role} kind={pawnKind} size={20}/>
                  <div className="fi-display-i" style={{fontSize:13, color:'var(--c-parch)'}}>{p.name}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex', gap:10}}>
              <Btn kind="ghost">Back to Home</Btn>
              <Btn kind="primary" size="lg" glow>Play Again →</Btn>
            </div>
          </div>
        </div>
      </div>
    </EndingShell>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{textAlign:'center'}}>
      <div className="fi-mono" style={{fontSize:9.5, letterSpacing:'.16em', color:'var(--c-sand2)'}}>{label.toUpperCase()}</div>
      <div className="fi-display" style={{fontSize:22, color:'var(--c-parch)', marginTop:3}}>{value}</div>
    </div>
  );
}

// ─── Loss screen ────────────────────────────────────────────────────────
const LOSS_REASONS = {
  fools_landing: {
    title: 'Fools’ Landing has sunk.',
    sub: 'There is no escape from a drowned heliport.',
    detail: 'The helicopter pad fell beneath the waves. Without it, no expedition leaves Forbidden Island.',
    art: 'landing',
  },
  treasure_lost: {
    title: 'The Crystal of Fire is lost.',
    sub: 'Both temples have sunk before its capture.',
    detail: 'Cave of Embers and Cave of Shadows now lie beneath the sea. The crystal cannot be retrieved.',
    art: 'treasure',
  },
  drowned: {
    title: 'Wren has drowned.',
    sub: 'Nowhere left to swim.',
    detail: 'When the Engineer’s tile sank, no adjacent land remained for them to reach.',
    art: 'drown',
  },
  water_max: {
    title: 'The sea has consumed the island.',
    sub: 'Water level has reached the skull.',
    detail: 'After too many Waters Rise! cards, the gauge filled. Nothing now stands above the tide.',
    art: 'gauge',
  },
};

function LossScreen({ width=1200, height=820, reason='fools_landing', pawnKind='portrait', style }) {
  const r = LOSS_REASONS[reason];
  const players = [
    { name:'Camille', role:'pilot' }, { name:'Wren', role:'engineer' },
    { name:'Tomás', role:'navigator'}, { name:'Jules', role:'diver'},
  ];
  return (
    <EndingShell width={width} height={height} tone="defeat" style={style}>
      <div style={{height:'100%', display:'grid', gridTemplateRows:'auto 1fr auto', padding:'60px 80px 40px'}}>
        <div style={{textAlign:'center'}}>
          <div className="fi-mono" style={{fontSize:11, letterSpacing:'.4em', color:'var(--c-danger)'}}>EXPEDITION LOST</div>
          <div className="fi-display" style={{fontSize:72, marginTop:14, color:'var(--c-parch)', letterSpacing:'-.01em', lineHeight:1}}>
            <span className="fi-display-i" style={{color:'#f0a89a'}}>Defeat.</span>
          </div>
          <div className="fi-display-i" style={{fontSize:20, marginTop:10, color:'var(--c-sand)'}}>{r.title}</div>
        </div>
        {/* art panel — reason-specific tableau */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
          <Parch style={{maxWidth: 760, padding:'24px 32px'}}>
            <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:24, alignItems:'center'}}>
              <LossArt kind={r.art} size={180}/>
              <div>
                <div className="fi-cap" style={{color:'var(--c-brassLo)'}}>Cause of Loss</div>
                <div className="fi-display" style={{fontSize:26, color:'var(--c-inkText)', marginTop:6}}>{r.sub}</div>
                <div style={{fontSize:13.5, color:'var(--c-inkText2)', marginTop:10, lineHeight:1.5}}>{r.detail}</div>
              </div>
            </div>
          </Parch>
        </div>
        <div>
          <hr className="fi-hr"/>
          <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:14, marginTop:14}}>
            <Stat label="Turns Played" value="11"/>
            <Stat label="Tiles Lost" value="9 / 24"/>
            <Stat label="Final Water" value={reason==='water_max'?'9 · Skull':'7 · Draw 5'}/>
            <Stat label="Treasures" value="2 / 4"/>
            <Stat label="Difficulty" value="Elite"/>
          </div>
          <div style={{marginTop:18, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{display:'flex', gap:10}}>
              {players.map(p=>(
                <div key={p.name} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:'rgba(8,22,28,.4)',borderRadius:18,border:'1px solid rgba(201,82,58,.2)'}}>
                  <Pawn role={p.role} kind={pawnKind} size={20}/>
                  <div className="fi-display-i" style={{fontSize:13, color:'var(--c-parch)'}}>{p.name}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex', gap:10}}>
              <Btn kind="ghost">Back to Home</Btn>
              <Btn kind="primary" size="lg">Try Again →</Btn>
            </div>
          </div>
        </div>
      </div>
    </EndingShell>
  );
}

function LossArt({ kind, size=160 }) {
  if (kind === 'landing') {
    return (
      <div style={{width:size, height:size, borderRadius:14, overflow:'hidden', position:'relative',
        background:`radial-gradient(circle at 50% 30%, var(--c-sea2) 0%, var(--c-sea) 50%, var(--c-ink) 100%)`,
        border:'1px solid rgba(201,82,58,.4)'}}>
        <svg viewBox="0 0 160 160" width="100%" height="100%">
          <path d="M0 110 Q40 100 80 110 T160 110 L160 160 L0 160 Z" fill="#1a4d5a" opacity=".8"/>
          <path d="M0 130 Q40 120 80 130 T160 130 L160 160 L0 160 Z" fill="#08161c" opacity=".7"/>
          <text x="80" y="80" fontFamily="JetBrains Mono" fontSize="14" fill="#caa052" textAnchor="middle" opacity=".7">↓ HELIPAD ↓</text>
        </svg>
      </div>
    );
  }
  if (kind === 'treasure') {
    return (
      <div style={{width:size,height:size,position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <TreasureMark treasure="crystal_of_fire" size={140}/>
        <div style={{position:'absolute', inset:0,
          background:'linear-gradient(135deg, transparent 40%, rgba(201,82,58,.85) 48%, rgba(201,82,58,.85) 52%, transparent 60%)',
          borderRadius:'50%'}}/>
        <div className="fi-mono" style={{position:'absolute', bottom:6, fontSize:10, color:'var(--c-danger)', letterSpacing:'.15em'}}>LOST</div>
      </div>
    );
  }
  if (kind === 'drown') {
    return (
      <div style={{width:size, height:size, borderRadius:14, overflow:'hidden', position:'relative',
        background:`radial-gradient(circle at 50% 30%, var(--c-sea2) 0%, var(--c-sea) 60%, var(--c-ink) 100%)`,
        display:'flex',alignItems:'center', justifyContent:'center'}}>
        <Pawn role="engineer" size={70} dim/>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
          <path d="M0 50 Q20 40 50 50 T100 50" stroke="var(--c-seaHi)" strokeWidth="1.4" fill="none" opacity=".7"/>
          <path d="M0 70 Q20 60 50 70 T100 70" stroke="var(--c-seaHi)" strokeWidth="1.2" fill="none" opacity=".5"/>
        </svg>
      </div>
    );
  }
  if (kind === 'gauge') {
    return <WaterMeter level={9}/>;
  }
}

// ─── Disconnect / reconnect state ──────────────────────────────────────
function DisconnectState({ width=900, height=560, pawnKind='portrait', style }) {
  return (
    <div style={{width,height,position:'relative', ...style}}>
      <ScreenBg style={{position:'absolute',inset:0}}>
        <div style={{position:'absolute', inset:0, opacity:.18, filter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div style={{transform:'scale(.5)'}}>
            <IslandGrid tileSize={92} gap={7} states={BASE_TILE_STATE} pawnsOnTile={buildPawnMap()}/>
          </div>
        </div>
        <div style={{position:'absolute',inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <Frame tone="ink2" padded={false} style={{padding:30, width: 540, textAlign:'center'}}>
            <Pawn role="navigator" size={68} dim style={{margin:'0 auto'}}/>
            <div className="fi-cap" style={{marginTop:14, color:'#f0a89a'}}>Connection Lost</div>
            <div className="fi-display" style={{fontSize:28, color:'var(--c-parch)', marginTop:6}}>
              Waiting for <span className="fi-display-i">Tomás</span>…
            </div>
            <div style={{fontSize:13, color:'var(--c-sand)', marginTop:8, lineHeight:1.5}}>
              The Navigator has disconnected mid-turn. If they don't return, their turn will be skipped automatically.
            </div>
            {/* countdown */}
            <div style={{marginTop:20, display:'flex', alignItems:'center', justifyContent:'center', gap:14}}>
              <div className="fi-display" style={{fontSize:42, color:'var(--c-danger)', letterSpacing:'.04em'}}>0:45</div>
              <div style={{width:160, height:6, background:'rgba(201,82,58,.18)', borderRadius:3, overflow:'hidden'}}>
                <div style={{width:'75%', height:'100%', background:'var(--c-danger)', boxShadow:'0 0 12px var(--c-danger)'}}/>
              </div>
            </div>
            <div style={{marginTop:18, display:'flex', justifyContent:'center', gap:10}}>
              <Btn kind="ghost" size="sm">Vote to Skip Now</Btn>
              <Btn kind="quiet" size="sm">Continue Without Them</Btn>
            </div>
          </Frame>
        </div>
      </ScreenBg>
    </div>
  );
}

// ─── "Player reconnected" toast moment ─────────────────────────────────
function ReconnectToast({ style }) {
  return (
    <div style={{
      width: 320, padding:'12px 16px', borderRadius:12,
      background:'linear-gradient(90deg, rgba(94,138,58,.25), rgba(20,48,56,.85))',
      border:'1px solid var(--c-leaf)',
      boxShadow:'0 12px 28px rgba(0,0,0,.4), 0 0 18px rgba(94,138,58,.2)',
      display:'flex',alignItems:'center',gap:12, fontFamily:'var(--ff-ui)',
      ...style,
    }}>
      <Pawn role="navigator" size={32}/>
      <div style={{flex:1}}>
        <div className="fi-cap" style={{color:'var(--c-leaf)'}}>Reconnected</div>
        <div className="fi-display-i" style={{fontSize:14, color:'var(--c-parch)'}}>Tomás is back aboard.</div>
      </div>
    </div>
  );
}

Object.assign(window, { EndingShell, WinScreen, LossScreen, LossArt, LOSS_REASONS, Stat, DisconnectState, ReconnectToast });
