// screen-lobby.jsx — Home, Create Game, Waiting Room, Join screens.

// ─── Brand mark ─────────────────────────────────────────────────────────
function BrandMark({ size='lg' }) {
  const sizes = { sm: { title: 18, kicker:9, compass:24 }, md: { title:28, kicker:10, compass:34}, lg: { title:46, kicker:11, compass:54 }, xl:{title:68,kicker:13,compass:76}};
  const s = sizes[size];
  return (
    <div style={{display:'inline-flex', alignItems:'center', gap:14}}>
      <Compass size={s.compass} color="var(--c-brassHi)"/>
      <div>
        <div className="fi-mono" style={{fontSize:s.kicker,letterSpacing:'.32em',color:'var(--c-brass)',marginBottom:2}}>A CO-OP EXPEDITION</div>
        <div className="fi-display" style={{fontSize:s.title,color:'var(--c-parch)',lineHeight:1,letterSpacing:'-.005em'}}>
          Forbidden <span className="fi-display-i">Island</span>
        </div>
      </div>
    </div>
  );
}

// ─── Background atmosphere ──────────────────────────────────────────────
function ScreenBg({ children, style }) {
  return (
    <div style={{
      width:'100%', height:'100%', position:'relative', overflow:'hidden',
      background:`
        radial-gradient(80% 60% at 30% 10%, rgba(58,151,168,.10) 0%, transparent 60%),
        radial-gradient(60% 50% at 80% 90%, rgba(202,160,82,.08) 0%, transparent 60%),
        linear-gradient(180deg, var(--c-ink) 0%, var(--c-ink2) 100%)`,
      color:'var(--c-parch)', fontFamily:'var(--ff-ui)',
      ...style,
    }}>
      {/* paper grain over everything */}
      <div aria-hidden style={{position:'absolute',inset:0,
        backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.12'/></svg>\")",
        mixBlendMode:'overlay', opacity:.6, pointerEvents:'none'}}/>
      {children}
    </div>
  );
}

// ─── Home screen ────────────────────────────────────────────────────────
function HomeScreen({ width=1200, height=820, name='', games=[
  { id:'a', host:'Camille', count:2, max:4, difficulty:'Normal' },
  { id:'b', host:'Wren', count:3, max:4, difficulty:'Elite' },
  { id:'c', host:'Tomás', count:1, max:4, difficulty:'Novice' },
], style }) {
  return (
    <ScreenBg style={{width, height, ...style}}>
      {/* hero island silhouette (placeholder) */}
      <div aria-hidden style={{position:'absolute', inset:0, opacity:.5,
        background:`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='820' viewBox='0 0 1200 820'><defs><radialGradient id='g' cx='50%25' cy='50%25' r='50%25'><stop offset='0%25' stop-color='%231a4d5a' stop-opacity='.7'/><stop offset='100%25' stop-color='%231a4d5a' stop-opacity='0'/></radialGradient></defs><polygon points='320,580 460,440 660,400 900,470 1020,620 850,720 560,740 380,690' fill='url(%23g)'/></svg>") no-repeat center / cover`}}/>
      <div style={{position:'relative', maxWidth: 1040, margin:'0 auto', padding:'48px 56px', height:'100%', display:'grid', gridTemplateColumns:'1fr 1fr', gap:56}}>
        {/* LEFT: brand + entry */}
        <div style={{display:'flex', flexDirection:'column', justifyContent:'center'}}>
          <BrandMark size="xl"/>
          <div className="fi-display-i" style={{marginTop:18, fontSize:18, color:'var(--c-sand)', lineHeight:1.4, maxWidth: 420}}>
            Four sacred treasures lie scattered across a sinking island. Recover them with your crew — before the sea claims everything.
          </div>
          <div style={{height:30}}/>
          <Frame tone="ink2" padded={false} style={{padding:'22px 24px'}}>
            <div className="fi-cap" style={{marginBottom:8}}>Your Name</div>
            <div style={{display:'flex', gap:10}}>
              <input
                placeholder="Mariner..." defaultValue={name}
                className="fi"
                style={{
                  flex:1, padding:'12px 14px', fontSize:15,
                  background:'rgba(8,22,28,.6)', color:'var(--c-parch)',
                  border:'1px solid var(--c-brassLo)', borderRadius:8,
                  fontFamily:'var(--ff-display)', fontStyle:'italic',
                  outline:'none',
                }}
                readOnly
              />
              <Btn kind="primary" size="lg" glow={!!name || true}>Create Game</Btn>
            </div>
            <div className="fi-mono" style={{fontSize:9.5, color:'var(--c-sand2)', marginTop:10, letterSpacing:'.1em'}}>1–20 CHARACTERS · STORED LOCALLY</div>
          </Frame>
        </div>
        {/* RIGHT: open games */}
        <div style={{display:'flex', flexDirection:'column', justifyContent:'center'}}>
          <div className="fi-cap" style={{marginBottom:8}}>Open Expeditions</div>
          <div className="fi-display" style={{fontSize:24, color:'var(--c-parch)', marginBottom:14}}>Join a crew</div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {games.map(g=>(
              <div key={g.id} style={{
                display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
                background:'rgba(20,48,56,.55)', borderRadius:12,
                border:'1px solid rgba(202,160,82,.2)',
                boxShadow:'0 6px 16px rgba(0,0,0,.3)',
              }}>
                <div style={{flex:1}}>
                  <div className="fi-display" style={{fontSize:16, color:'var(--c-parch)'}}>{g.host}'s expedition</div>
                  <div style={{display:'flex', gap:10, marginTop:4}}>
                    <Pill tone="brass">{g.difficulty}</Pill>
                    <Pill tone="sea">{g.count} / {g.max} aboard</Pill>
                  </div>
                </div>
                <div style={{display:'flex',gap:4}}>
                  {[...Array(g.max)].map((_,i)=>(
                    <div key={i} style={{
                      width:8,height:24,borderRadius:2,
                      background:i<g.count?'var(--c-brass)':'transparent',
                      border:'1px solid rgba(202,160,82,.4)',
                    }}/>
                  ))}
                </div>
                <Btn size="md">Join</Btn>
              </div>
            ))}
            {games.length===0 && (
              <Parch style={{padding:18,textAlign:'center'}}>
                <div className="fi-display-i" style={{fontSize:15,color:'var(--c-inkText2)'}}>No expeditions afoot. Create one!</div>
              </Parch>
            )}
          </div>
          {/* rejoin banner */}
          <div style={{marginTop:14, padding:'10px 14px', borderRadius:10,
            border:'1px dashed var(--c-brassHi)', background:'rgba(232,196,122,.06)',
            display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'var(--c-brassHi)',boxShadow:'0 0 8px var(--c-brassHi)',animation:'fi-pulse 1.6s ease-in-out infinite'}}/>
            <div style={{flex:1, fontSize:12,color:'var(--c-sand)'}}>
              <span className="fi-display-i" style={{fontSize:13,color:'var(--c-brassHi)'}}>You have a voyage in progress.</span> Rejoin Wren's expedition?
            </div>
            <Btn kind="ghost" size="sm">Rejoin</Btn>
          </div>
        </div>
      </div>
      {/* footer */}
      <div style={{position:'absolute', bottom: 14, left:0, right:0, textAlign:'center', fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'.2em', color:'var(--c-sand2)', opacity:.6}}>
        WEBSOCKET · LOBBY:IDENTITY · GET /api/games
      </div>
    </ScreenBg>
  );
}

// ─── Create Game screen ─────────────────────────────────────────────────
function CreateGameScreen({ width=1200, height=820, difficulty='normal', style }) {
  const opts = [
    { id:'novice',    label:'Novice',    water:1, sub:'Relaxed pace, great for learning' },
    { id:'normal',    label:'Normal',    water:2, sub:'Standard challenge'              },
    { id:'elite',     label:'Elite',     water:3, sub:'For experienced players'          },
    { id:'legendary', label:'Legendary', water:4, sub:'Near-impossible odds'             },
  ];
  return (
    <ScreenBg style={{width, height, ...style}}>
      <div style={{maxWidth: 900, margin:'0 auto', padding:'52px 56px', display:'flex',flexDirection:'column',gap:24}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
          <BrandMark size="md"/>
          <Btn kind="ghost" size="sm">← Back</Btn>
        </div>
        <div>
          <div className="fi-cap" style={{marginBottom:8}}>Step 1 of 3</div>
          <div className="fi-display" style={{fontSize:34, color:'var(--c-parch)'}}>Choose your difficulty</div>
          <div style={{fontSize:13, color:'var(--c-sand2)', marginTop:6, maxWidth:520, lineHeight:1.5}}>
            Difficulty sets the starting water level. Higher levels mean more flood cards per turn — and far less margin for error.
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          {opts.map(o=>{
            const sel = o.id === difficulty;
            return (
              <div key={o.id} style={{
                position:'relative',
                padding:18, borderRadius:14,
                background: sel
                  ? 'linear-gradient(180deg, rgba(232,196,122,.16), rgba(202,160,82,.04))'
                  : 'rgba(20,48,56,.5)',
                border:`1px solid ${sel?'var(--c-brassHi)':'rgba(202,160,82,.2)'}`,
                boxShadow: sel?'0 0 0 1px var(--c-brassHi), 0 12px 28px rgba(0,0,0,.4)':'0 6px 16px rgba(0,0,0,.3)',
                display:'flex', alignItems:'center', gap:16, cursor:'pointer',
              }}>
                <WaterMeter level={o.water} orientation="vertical" compact style={{width:48}}/>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'baseline', gap:10}}>
                    <div className="fi-display" style={{fontSize:22, color:'var(--c-parch)'}}>{o.label}</div>
                    {sel && <Pill tone="brass">Selected</Pill>}
                  </div>
                  <div style={{fontSize:12, color:'var(--c-sand)', marginTop:4, lineHeight:1.4}}>{o.sub}</div>
                  <div className="fi-mono" style={{marginTop:8, fontSize:10, letterSpacing:'.12em', color:'var(--c-brassLo)'}}>
                    START WATER · {o.water} · DRAW {o.water<=2?2:3} FLOOD/TURN
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:18}}>
          <div style={{fontSize:12, color:'var(--c-sand2)'}}>You'll select your role in the next room.</div>
          <div style={{display:'flex',gap:10}}>
            <Btn kind="ghost">Cancel</Btn>
            <Btn kind="primary" size="lg" glow>Create Expedition →</Btn>
          </div>
        </div>
      </div>
    </ScreenBg>
  );
}

// ─── Waiting Room ────────────────────────────────────────────────────────
function WaitingRoom({ width=1200, height=820, pawnKind='portrait', style }) {
  const slots = [
    { name:'Camille',   role:'pilot',     host:true, isYou:true,  ready:true },
    { name:'Wren',      role:'engineer',  ready:true },
    { name:'Tomás',     role:'navigator', ready:true },
    { name:null, role:null },
  ];
  const claimed = { pilot:'Camille', engineer:'Wren', navigator:'Tomás' };
  return (
    <ScreenBg style={{width, height, ...style}}>
      <div style={{maxWidth: 1080, margin:'0 auto', padding:'34px 48px', display:'flex',flexDirection:'column', gap:22}}>
        <div style={{display:'flex',alignItems:'center', justifyContent:'space-between'}}>
          <BrandMark size="md"/>
          <Btn kind="ghost" size="sm">Leave Expedition</Btn>
        </div>

        {/* room banner */}
        <Frame tone="ink2" style={{padding:'18px 22px', display:'flex',alignItems:'center', gap:24}}>
          <div style={{flex:1}}>
            <div className="fi-cap">Expedition #</div>
            <div className="fi-display" style={{fontSize:30, color:'var(--c-brassHi)', letterSpacing:'.05em'}}>FI-7K2N-9X</div>
            <div className="fi-mono" style={{fontSize:10,color:'var(--c-sand2)',marginTop:4}}>SHARE THIS CODE OR THE LINK BELOW</div>
          </div>
          <div style={{flex:1, display:'flex', flexDirection:'column', gap:6}}>
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              <input readOnly value="https://forbidden.island/game/FI-7K2N-9X/lobby"
                className="fi" style={{flex:1, padding:'8px 12px', fontSize:11.5, fontFamily:'var(--ff-mono)',
                background:'rgba(8,22,28,.5)', color:'var(--c-sand)', border:'1px solid rgba(202,160,82,.25)', borderRadius:6, outline:'none'}}/>
              <Btn kind="ghost" size="sm">Copy</Btn>
            </div>
            <div style={{display:'flex',gap:6}}>
              <Pill tone="brass">Normal · Water 2</Pill>
              <Pill tone="sea">3 / 4 aboard</Pill>
              <Pill tone="sand">Host: Camille</Pill>
            </div>
          </div>
        </Frame>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:22}}>
          {/* Player slots */}
          <Frame tone="ink2" padded={false} style={{padding:18}}>
            <div className="fi-cap" style={{marginBottom:10}}>Crew</div>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {slots.map((s,i)=>(
                <div key={i} style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'10px 12px', borderRadius:10,
                  background: s.name ? 'rgba(8,22,28,.55)' : 'transparent',
                  border:`1px dashed ${s.name?'transparent':'rgba(202,160,82,.25)'}`,
                  ...(s.name ? { borderStyle:'solid', borderColor:'rgba(202,160,82,.18)' } : {}),
                }}>
                  {s.name ? (
                    <>
                      <Pawn role={s.role} kind={pawnKind} size={38} isActive={s.isYou}/>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{display:'flex',alignItems:'baseline', gap:8}}>
                          <div className="fi-display" style={{fontSize:16,color:'var(--c-parch)'}}>{s.name}</div>
                          {s.host && <Pill tone="brass">Host</Pill>}
                          {s.isYou && <Pill tone="sand">You</Pill>}
                        </div>
                        <div className="fi-mono" style={{fontSize:9.5,color:'var(--c-sand2)',marginTop:2,letterSpacing:'.1em'}}>{ROLES_BY_ID[s.role]?.name.toUpperCase()}</div>
                      </div>
                      <div style={{
                        width:20,height:20,borderRadius:'50%',
                        background:'rgba(94,138,58,.2)', border:'1px solid var(--c-leaf)',
                        display:'flex',alignItems:'center',justifyContent:'center',
                        color:'var(--c-leaf)',fontSize:13
                      }}>✓</div>
                    </>
                  ) : (
                    <>
                      <div style={{width:38,height:38,borderRadius:'50%',
                        background:'rgba(8,22,28,.6)', border:'1px dashed rgba(202,160,82,.4)',
                        display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:'var(--c-brass)',animation:'fi-pulse 1.4s ease-in-out infinite'}}/>
                      </div>
                      <div style={{flex:1}}>
                        <div className="fi-display-i" style={{fontSize:14,color:'var(--c-sand2)'}}>Awaiting player…</div>
                        <div className="fi-mono" style={{fontSize:9.5,color:'var(--c-sand2)',opacity:.7,marginTop:2}}>SLOT {i+1}</div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Frame>
          {/* Role selection */}
          <Frame tone="ink2" padded={false} style={{padding:18}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:10}}>
              <div className="fi-cap">Choose Your Role</div>
              <Btn kind="ghost" size="sm">⚂ Random</Btn>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
              {ROLES.map(r=>{
                const c = claimed[r.id];
                const isMe = c === 'Camille';
                return (
                  <RoleCard key={r.id} role={r.id} pawnKind={pawnKind}
                    selected={isMe}
                    claimedBy={c} isMe={isMe}
                    available={!c || isMe}
                  />
                );
              })}
            </div>
          </Frame>
        </div>

        {/* host controls */}
        <Frame tone="ink2" style={{display:'flex',alignItems:'center',gap:18}}>
          <div style={{flex:1}}>
            <div className="fi-cap">Host Controls</div>
            <div style={{display:'flex',gap:14,marginTop:6,alignItems:'center'}}>
              <div style={{fontSize:13,color:'var(--c-sand)'}}>Difficulty</div>
              <div style={{display:'flex',gap:6}}>
                {['Novice','Normal','Elite','Legendary'].map(d=>(
                  <button key={d} className="fi" style={{
                    padding:'5px 10px', fontSize:11, letterSpacing:'.05em',
                    background: d==='Normal'?'var(--c-brass)':'transparent', color: d==='Normal'?'var(--c-ink)':'var(--c-sand)',
                    border:'1px solid rgba(202,160,82,.3)', borderRadius:6, fontWeight:600, textTransform:'uppercase'
                  }}>{d}</button>
                ))}
              </div>
            </div>
          </div>
          <Btn kind="primary" size="lg" glow>Set Sail →</Btn>
        </Frame>
      </div>
    </ScreenBg>
  );
}

// ─── Join-by-link prompt (inline modal) ─────────────────────────────────
function JoinByLink({ width=600, height=380, style }) {
  return (
    <Frame tone="ink2" padded={false} style={{width, height, padding:'30px 32px', position:'relative', ...style}}>
      <div className="fi-cap" style={{marginBottom:8}}>Joining Expedition · FI-7K2N-9X</div>
      <div className="fi-display" style={{fontSize:26, color:'var(--c-parch)'}}>What shall we call you?</div>
      <div style={{fontSize:12, color:'var(--c-sand2)', marginTop:6}}>Camille has invited you. Enter your name to board.</div>
      <div style={{marginTop:24}}>
        <div className="fi-cap" style={{marginBottom:6}}>Your Name</div>
        <input className="fi" placeholder="Mariner..." style={{
          width:'100%', padding:'12px 14px', fontSize:16,
          background:'rgba(8,22,28,.6)', color:'var(--c-parch)',
          border:'1px solid var(--c-brassLo)', borderRadius:8,
          fontFamily:'var(--ff-display)', fontStyle:'italic', outline:'none',
        }}/>
      </div>
      <div style={{position:'absolute', bottom:24, right:30, display:'flex',gap:10}}>
        <Btn kind="ghost">Back</Btn>
        <Btn kind="primary" glow>Board the Expedition →</Btn>
      </div>
    </Frame>
  );
}

Object.assign(window, { BrandMark, ScreenBg, HomeScreen, CreateGameScreen, WaitingRoom, JoinByLink });
