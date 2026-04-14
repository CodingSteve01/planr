export function Onboard({onCreate,onLoad,fRef}){
  return<div className="onboard">
    <div className="onboard-card fade">
      <div className="onboard-logo">Planr<span style={{color:'var(--ac)'}}>.</span></div>
      <div className="onboard-sub">Resource-aware project scheduler</div>
      <div className="feat-grid">
        {[['🌳','Work Tree','Hierarchical WBS with deps & multiple assignments'],
          ['📅','Auto-schedule','Person-level parallel scheduling + capacity planning'],
          ['⚡','Critical Path','CPM analysis — see what drives your end date'],
          ['🕸','Network Graph','Visual dependency map, zoom/pan, click to edit'],
          ['🎯','Focus Areas','Goals, painpoints, deadlines, and top-down planning'],
          ['💾','Save / Load','JSON export/import — works offline & GitHub Pages'],
        ].map(([i,t,d])=><div key={t} className="feat">
          <span className="feat-icon">{i}</span>
          <div className="feat-text"><strong>{t}</strong><span>{d}</span></div>
        </div>)}
      </div>
      <div className="ob-actions">
        <button className="ob-btn ob-pri" onClick={onCreate}>Start new project</button>
        <div className="ob-div">or</div>
        <button className="ob-btn ob-sec" onClick={()=>fRef.current?.click()}>Load project (.json)</button>
      </div>
    </div>
  </div>;
}
