(() => {
  /*
   * BOARD SETUP
   * These values describe the same board that index.html displays.
   * JavaScript creates the individual cells and pipe elements inside #board.
   */
  const ROWS = 20, COLS = 30, SURFACE_ROWS = 4, PIPE_START_ROWS = 4;
  const board = document.getElementById('board');
  const titleScreen = document.getElementById('title-screen');
  const gameScreen = document.getElementById('game-screen');
  const moveCountEl = document.getElementById('move-count');
  const modal = document.getElementById('win-modal');
  const starRating = document.getElementById('star-rating');
  const starMessage = document.getElementById('star-message');
  const levelNumber = document.getElementById('level-number');
  const levelFooter = document.getElementById('level-footer');

  let level = 1, moves = 0, selectedPipe = null, dragState = null, won = false;
  let cells = [], pipes = [], obstacles = new Set(), obstacleShapes = [], route = [];
  let random = Math.random;

  /* Directions use N/E/S/W bits. Pipe shape and rotation determine its open ends. */
  const DIRS = [{name:'N',dr:-1,dc:0,bit:1,op:4},{name:'E',dr:0,dc:1,bit:2,op:8},{name:'S',dr:1,dc:0,bit:4,op:1},{name:'W',dr:0,dc:-1,bit:8,op:2}];
  const shapes = {straight:5, elbow:3, tee:11, cross:15, cap:1};
  const rotateMask = (mask, turns=1) => { for(let i=0;i<turns;i++) mask=((mask<<1)&15)|(mask>>3); return mask; };
  const maskFor = p => rotateMask(shapes[p.shape], p.rotation);
  const activeVisualLength = p => p.visualType==='straight' ? p.visualLength : 2;
  const visualCells = (p,r=p.r,c=p.c) => {
    const cellsForPiece=[];
    const length=activeVisualLength({...p,r});
    if(p.visualType==='straight' && p.rotation%2===0){
      for(let row=r;row<r+length;row++) cellsForPiece.push(key(row,c));
    } else if(p.visualType==='straight'){
      for(let col=c;col<c+length;col++) cellsForPiece.push(key(r,col));
    } else {
      for(let row=r;row<r+length;row++) for(let col=c;col<c+length;col++) cellsForPiece.push(key(row,col));
    }
    return cellsForPiece;
  };
  const visualCellsAvailable = (p,r,c,used=new Set()) => visualCells(p,r,c).every(cell=>{
    const [row,col]=cell.split(',').map(Number);
    return !isUnavailableCell(row,col) && !used.has(cell);
  });
  const visualCellsAboveGrass = (p,r,c) => visualCells(p,r,c).every(cell => {
    const [row] = cell.split(',').map(Number);
    return row < PIPE_START_ROWS;
  });
  const visualCellsOverlap = (first,firstR,firstC,second) => {
    const occupied=new Set(visualCells(first,firstR,firstC));
    return visualCells(second).some(cell=>occupied.has(cell));
  };
  const placementAllowed = (p,r,c) => visualCellsAvailable(p,r,c) &&
    !pipes.some(other=>other!==p && visualCellsOverlap(p,r,c,other));
  function showDropPreview(p,r,c){
    p.el.classList.toggle('invalid-placement', !placementAllowed(p,r,c));
  }
  const SOURCE = {r:4,c:14};
  const inReservoir = (r,c) => r>=17 && r<=19 && c>=25 && c<=29;
  const key = (r,c) => `${r},${c}`;
  const inBounds = (r,c) => r>=0 && r<ROWS && c>=0 && c<COLS;
  const cellAt = (r,c) => cells[r*COLS+c];
  const isUnavailableCell = (r,c) => !inBounds(r,c) || obstacles.has(key(r,c)) ||
    (r>=17 && c>=25) || (r<PIPE_START_ROWS && c>=12 && c<=16) || (r===4 && c===14);
  const cellFromPoint = (clientX,clientY) => {
    const bounds=board.getBoundingClientRect();
    const c=Math.floor((clientX-bounds.left)/bounds.width*COLS);
    const r=Math.floor((clientY-bounds.top)/bounds.height*ROWS);
    return inBounds(r,c)?cellAt(r,c):null;
  };
  function createRandom(seed){
    let value=seed>>>0;
    return () => {
      value=(value*1664525+1013904223)>>>0;
      return value/4294967296;
    };
  }

  function startGame() {
    titleScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
    buildLevel(); window.scrollTo({top:0,behavior:'smooth'});
  }
  board.addEventListener('pointerdown', onPointerDown);
  document.getElementById('start-button').addEventListener('click', startGame);
  document.getElementById('reset-button').addEventListener('click', buildLevel);
  document.getElementById('shuffle-button').addEventListener('click', buildLevel);
  document.getElementById('rotate-button').addEventListener('click', rotateSelected);
  document.getElementById('replay-button').addEventListener('click', () => { modal.classList.add('hidden'); level++; buildLevel(); });

  function buildLevel() {
    /* Build a fresh board and reset the counters for the current level. */
    moves=0; won=false; selectedPipe=null; dragState=null; pipes=[]; obstacles=new Set(); obstacleShapes=[]; route=[]; modal.classList.add('hidden');
    // Use a fresh seed so every start, restart, and shuffle gets a new arrangement.
    const seed=(Date.now() ^ Math.floor(Math.random()*4294967296))>>>0;
    random=createRandom(seed);
    moveCountEl.textContent='0'; levelNumber.textContent=String(level).padStart(2,'0'); levelFooter.textContent=String(level).padStart(2,'0');
    board.innerHTML=''; cells=[];
    // The solution uses the real pipe sizes, then scatters those pieces above ground.
    route=makeSolution();
    const routeKeys=new Set(route.flatMap(spec=>visualCells({...spec,rotation:spec.solutionRotation},spec.solution.r,spec.solution.c)));
    // Add one of every supplied obstacle asset, using the filename marker for its footprint.
    const obstacleSpecs=[
      {asset:'rock_01_square_1x1.svg',rows:1,cols:1},
      {asset:'rock_02_wide_1x2.svg',rows:1,cols:2},
      {asset:'rock_03_tall_3x2.svg',rows:3,cols:2},
      {asset:'rock_05_extra_wide_1x4.svg',rows:1,cols:4},
      {asset:'rock_06_landscape_1x2.svg',rows:1,cols:2},
      {asset:'Skull_2x3.svg',rows:2,cols:3},
      {asset:'Bone_1x4.svg',rows:1,cols:4},
      {asset:'cracked_pipe_01_long_split_1x3.svg',rows:1,cols:3},
      {asset:'cracked_pipe_02_wide_break_1x3.svg',rows:1,cols:3},
      {asset:'pipe_horizontal_long_split_1x5.svg',rows:1,cols:5},
      {asset:'pipe_horizontal_short_wide_break_1x2.svg',rows:1,cols:2},
      {asset:'pipe_elbow_weld_crack_horizontal_2x2.svg',rows:2,cols:2}
    ];
    for(const spec of obstacleSpecs){
      const {asset,rows,cols}=spec;
      const canPlace=(r,c)=>{
        const footprint=[];
        for(let row=r;row<r+rows;row++) for(let col=c;col<c+cols;col++) footprint.push(key(row,col));
        return !footprint.some(cell=>{
          const [row,col]=cell.split(',').map(Number);
          return routeKeys.has(cell) || obstacles.has(cell) || isUnavailableCell(row,col);
        });
      };
      const savePlacement=(r,c)=>{
        for(let row=r;row<r+rows;row++) for(let col=c;col<c+cols;col++) obstacles.add(key(row,col));
        obstacleShapes.push({r,c,rows,cols,asset});
      };
      let placed=false;
      for(let attempt=0;attempt<100&&!placed;attempt++){
        const r=5+Math.floor(random()*(20-5-rows));
        const c=Math.floor(random()*(COLS-cols));
        if(!canPlace(r,c)) continue;
        savePlacement(r,c);
        placed=true;
      }
      // Scan the board if random placement could not find a free footprint.
      if(!placed){
        for(let r=5;r<=20-rows&&!placed;r++) for(let c=0;c<=COLS-cols&&!placed;c++){
          if(!canPlace(r,c)) continue;
          savePlacement(r,c);
          placed=true;
        }
      }
    }

    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const el=document.createElement('div'); el.className='cell'; el.dataset.r=r; el.dataset.c=c;
      if(r<SURFACE_ROWS) {
        el.classList.add('surface',`surface-row-${r}`);
      } else {
        el.classList.add('ground');
      }
      if(r===1 && c===14){ el.classList.add('house-cell'); el.style.gridColumn='13 / span 5'; el.style.gridRow='1 / span 4'; }
      // Elements are kept in a flat grid; the well house and reservoir are layered across multiple cells below.
      board.appendChild(el); cells.push(el);
    }
    /* Decorative sky sits above the cells but below the well house and pipes. */
    const skyDecorations=document.createElement('div');
    skyDecorations.className='board-sky-decorations';
    skyDecorations.innerHTML='<span class="board-sky-sun"></span><span class="board-sky-cloud board-sky-cloud-one"></span><span class="board-sky-cloud board-sky-cloud-two"></span>';
    board.appendChild(skyDecorations);
    /* Add the above-ground well house, faucet, and reservoir overlays. */
    const house=document.createElement('div'); house.className='well-house'; house.style.gridColumn='13 / span 5'; house.style.gridRow='1 / span 4';
    house.innerHTML='<div class="brand-mark"><img class="brand-jerrycan" src="img/water-can-transparent.png" alt=""><span><b>charity:</b> water</span></div><div class="house-label">WELL HOUSE</div><span class="source-port"></span>';
    board.appendChild(house);
    // This fixed outlet is part of the well house and cannot be dragged.
    const sourcePipe=document.createElement('div');
    sourcePipe.className='source-pipe';
    sourcePipe.style.gridColumn='15';
    sourcePipe.style.gridRow='5';
    sourcePipe.innerHTML=pipeSVG({shape:'straight',visualType:'straight',visualLength:1,rotation:0,r:3,c:14});
    board.appendChild(sourcePipe);
    // Reservoir is a large, clear destination in the bottom-right corner.
    const reservoir=document.createElement('div'); reservoir.className='reservoir'; reservoir.style.gridColumn='26 / span 5'; reservoir.style.gridRow='18 / span 3';
    reservoir.innerHTML='<img src="img/water resevoir.svg" alt="Water reservoir" draggable="false"><span class="reservoir-label">WATER RESERVOIR</span>';
    board.appendChild(reservoir);
    /* Draw each underground obstacle at its exact grid footprint. */
    obstacleShapes.forEach(obstacle=>{
      const object=document.createElement('div');
      const isStraightBrokenPipe=obstacle.asset.includes('pipe') && !obstacle.asset.includes('elbow');
      object.className=`obstacle-object${isStraightBrokenPipe?' obstacle-straight-pipe':''}`;
      object.style.gridColumn=`${obstacle.c+1} / span ${obstacle.cols}`;
      object.style.gridRow=`${obstacle.r+1} / span ${obstacle.rows}`;
      object.innerHTML=`<img src="img/Obstacle assets/${obstacle.asset}" alt="Underground obstacle" draggable="false">`;
      board.appendChild(object);
    });
    /* Generate the pipe pieces needed to complete the route. */
    // Pieces begin scattered in the open cells, with their orientations randomized.
    const pieceSpecs=route.slice();
    // Keep the same total number of visible pipes as the original level.
    [2,2].forEach((length,index)=>{
      pieceSpecs.push({
        shape:'straight',
        visualType:'straight',
        visualLength:length,
        solutionRotation:0,
        rotation:0,
        solution:{r:0,c:0},
        id:route.length+index,
        isExtra:true
      });
    });
    // Start pieces above the green boundary, leaving the well-house footprint clear.
    const slots=[];
    for(let r=0;r<PIPE_START_ROWS;r++) for(let c=0;c<COLS;c++){
      if(!isUnavailableCell(r,c)) slots.push({r,c});
    }
    shuffle(slots);
    // Shuffle which piece goes to which start slot; pieces are movable and rotatable.
    const shuffledSpecs=pieceSpecs.slice(); shuffle(shuffledSpecs);
    const usedStartCells=new Set();
    shuffledSpecs.forEach(spec=>{
      let slot=null;
      let p={...spec,r:0,c:0,rotation:0,el:null};
      const rotations=shuffle([0,1,2,3]);
      for(const rotation of rotations){
        p.rotation=rotation;
        slot=slots.find(candidate=>visualCellsAboveGrass(p,candidate.r,candidate.c) &&
          visualCellsAvailable(p,candidate.r,candidate.c,usedStartCells));
        if(slot) break;
      }
      if(!slot) return;
      p.r=slot.r;p.c=slot.c;
      visualCells(p).forEach(cell=>usedStartCells.add(cell));
      pipes.push(p);
    });
    renderPipes();
  }

  function makeSolution() {
    /* Lay real pieces end to end from the well outlet to the reservoir. */
    const steps=[
      {straight:3},{turn:'E'},{straight:2},{turn:'S'},
      {straight:3},{turn:'E'},{straight:4},{turn:'S'}
    ];
    const specs=[];
    let r=5,c=14,heading='S';
    steps.forEach(step=>{
      if(step.straight){
        const vertical=heading==='S';
        specs.push({shape:'straight',visualType:'straight',visualLength:step.straight,solutionRotation:vertical?0:1,rotation:0,solution:{r,c},id:specs.length});
        if(vertical) r+=step.straight; else c+=step.straight;
      } else {
        const toEast=step.turn==='E';
        specs.push({shape:'elbow',visualType:'corner',visualLength:2,solutionRotation:toEast?0:2,rotation:0,solution:{r,c},id:specs.length});
        if(toEast){r+=1;c+=2;} else {r+=2;c+=1;}
        heading=step.turn;
      }
    });
    return specs;
  }
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

  function pipeSVG(p) {
    /* Draw a steel pipe with dark end plates, rivets, and an inner water channel. */
    if(p.visualType==='straight') return straightPipeSVG(p);
    return cornerPipeSVG(p);
  }
  function straightPipeSVG(p){
    const vertical=p.rotation%2===0;
    const length=activeVisualLength(p);
    const width=vertical?100:length*100;
    const height=vertical?length*100:100;
    const plateStart=vertical?`<rect class="pipe-plate" x="8" y="5" width="84" height="30" rx="7"/><circle class="pipe-rivet" cx="25" cy="20" r="6"/><circle class="pipe-rivet" cx="75" cy="20" r="6"/>`:`<rect class="pipe-plate" x="5" y="8" width="30" height="84" rx="7"/><circle class="pipe-rivet" cx="20" cy="25" r="6"/><circle class="pipe-rivet" cx="20" cy="75" r="6"/>`;
    const plateEnd=vertical?`<rect class="pipe-plate" x="8" y="${height-35}" width="84" height="30" rx="7"/><circle class="pipe-rivet" cx="25" cy="${height-20}" r="6"/><circle class="pipe-rivet" cx="75" cy="${height-20}" r="6"/>`:`<rect class="pipe-plate" x="${width-35}" y="8" width="30" height="84" rx="7"/><circle class="pipe-rivet" cx="${width-20}" cy="25" r="6"/><circle class="pipe-rivet" cx="${width-20}" cy="75" r="6"/>`;
    const fullBodyPath=vertical?`M 50 20 L 50 ${height-20}`:`M 20 50 L ${width-20} 50`;
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path class="pipe-shadow" d="${fullBodyPath}"/><path class="pipe-metal" d="${fullBodyPath}"/><path class="pipe-water" d="${fullBodyPath}"/>${plateStart}${plateEnd}</svg>`;
  }
  function cornerPipeSVG(p){
    const mask=maskFor(p), cx=100,cy=100;
    const elbowPaths={
      3:{path:'M 50 0 L 50 150 L 200 150',endpoints:[{x:50,y:0,dir:'N'},{x:200,y:150,dir:'E'}]},
      6:{path:'M 200 50 L 50 50 L 50 200',endpoints:[{x:200,y:50,dir:'E'},{x:50,y:200,dir:'S'}]},
      12:{path:'M 150 200 L 150 50 L 0 50',endpoints:[{x:150,y:200,dir:'S'},{x:0,y:50,dir:'W'}]},
      9:{path:'M 0 150 L 150 150 L 150 0',endpoints:[{x:0,y:150,dir:'W'},{x:150,y:0,dir:'N'}]}
    }[mask] || {path:'M 50 0 L 50 150 L 200 150',endpoints:[{x:50,y:0,dir:'N'},{x:200,y:150,dir:'E'}]};
    let lines=`<path class="pipe-shadow" d="${elbowPaths.path}"/><path class="pipe-metal" d="${elbowPaths.path}"/><path class="pipe-water" d="${elbowPaths.path}"/>`;
    elbowPaths.endpoints.forEach(endpoint=>{
      if(endpoint.dir==='N' || endpoint.dir==='S'){
        const x=endpoint.x-42;
        const y=endpoint.dir==='N'?0:170;
        lines+=`<rect class="pipe-plate" x="${x}" y="${y}" width="84" height="30" rx="7"/><circle class="pipe-rivet" cx="${x+17}" cy="${y+15}" r="6"/><circle class="pipe-rivet" cx="${x+67}" cy="${y+15}" r="6"/>`;
      } else {
        const x=endpoint.dir==='W'?0:170;
        const y=endpoint.y-42;
        lines+=`<rect class="pipe-plate" x="${x}" y="${y}" width="30" height="84" rx="7"/><circle class="pipe-rivet" cx="${x+15}" cy="${y+17}" r="6"/><circle class="pipe-rivet" cx="${x+15}" cy="${y+67}" r="6"/>`;
      }
    });
    return `<svg viewBox="0 0 200 200" aria-hidden="true">${lines}</svg>`;
  }
  function renderPipes(){
    /* Recreate each pipe element so its position and rotation stay in sync. */
    board.querySelectorAll('.pipe-piece').forEach(e=>e.remove());
    pipes.forEach(p=>{
      const el=document.createElement('div');el.className='pipe-piece';el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',`${p.shape} pipe. Select and press R to rotate.`);
      el.innerHTML=pipeSVG(p);el.dataset.pipeId=p.id;p.el=el;placePipeElement(p);
      el.addEventListener('click',e=>{e.stopPropagation();selectPipe(p);});
      el.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'||e.key==='ArrowUp'){e.preventDefault();selectPipe(p);rotateSelected();}});
      board.appendChild(el);
    });
  }
  // Pipes are grid items, so their row and column place them in one exact cell.
  function placePipeElement(p){
    const vertical=p.visualType==='straight' && p.rotation%2===0;
    const length=activeVisualLength(p);
    if(p.visualType==='corner'){
      p.el.style.gridColumn=`${p.c+1} / span ${length}`;
      p.el.style.gridRow=`${p.r+1} / span ${length}`;
    } else {
      p.el.style.gridColumn=vertical?`${p.c+1}`:`${p.c+1} / span ${length}`;
      p.el.style.gridRow=vertical?`${p.r+1} / span ${length}`:`${p.r+1}`;
    }
    p.el.innerHTML=pipeSVG(p);
    p.el.style.touchAction='none';
  }
  function selectPipe(p){if(selectedPipe?.el)selectedPipe.el.classList.remove('selected');selectedPipe=p;p.el.classList.add('selected');}
  function onPointerDown(e){
    /* Dragging changes a pipe's row and column when it is dropped in an open cell. */
    const el=e.target.closest('.pipe-piece');if(!el||won)return;
    const p=pipes.find(x=>x.el===el);if(!p)return;
    const startCell=cellFromPoint(e.clientX,e.clientY);
    const pointerOffsetR=startCell?Number(startCell.dataset.r)-p.r:0;
    const pointerOffsetC=startCell?Number(startCell.dataset.c)-p.c:0;
    selectPipe(p);dragState={p,startR:p.r,startC:p.c,pointerId:e.pointerId,el,pointerOffsetR,pointerOffsetC,startX:e.clientX,startY:e.clientY};
    el.classList.add('dragging');el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    const move=e2=>{
      if(!dragState||dragState.pointerId!==e2.pointerId)return;
      el.style.transform=`translate(${e2.clientX-dragState.startX}px, ${e2.clientY-dragState.startY}px)`;
      const target=cellFromPoint(e2.clientX,e2.clientY);
      if(target){
        const targetR=Number(target.dataset.r)-dragState.pointerOffsetR;
        const targetC=Number(target.dataset.c)-dragState.pointerOffsetC;
        showDropPreview(dragState.p,targetR,targetC);
      }else el.classList.add('invalid-placement');
    };
    const up=e2=>{
      if(!dragState||dragState.pointerId!==e2.pointerId)return;
      const target=cellFromPoint(e2.clientX,e2.clientY);
      const r=target?Number(target.dataset.r)-dragState.pointerOffsetR:-1;
      const c=target?Number(target.dataset.c)-dragState.pointerOffsetC:-1;
      const p0=dragState.p; const oldR=p0.r,oldC=p0.c;
      if(target && placementAllowed(p0,r,c)){
        p0.r=r;p0.c=c;placePipeElement(p0);
        if(r!==oldR||c!==oldC){moves++;moveCountEl.textContent=String(moves);checkConnection();}
      }else{placePipeElement(p0);}
      el.style.transform='';el.classList.remove('dragging','invalid-placement');
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);dragState=null;
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
  }
  function rotateSelected(){
    /* Keyboard and click controls both use this function to rotate a selected pipe. */
    if(!selectedPipe||won)return;
    selectedPipe.rotation=(selectedPipe.rotation+1)%4;selectedPipe.el.innerHTML=pipeSVG(selectedPipe);
    placePipeElement(selectedPipe);
    moves++;moveCountEl.textContent=String(moves);checkConnection();
  }
  document.addEventListener('keydown',e=>{
    if(e.key.toLowerCase()==='r'&&!gameScreen.classList.contains('hidden')&&!modal.classList.contains('hidden')===false){
      if(!e.target.matches('input,textarea,button'))rotateSelected();
    }
  });

  /* Flood-fill from the well outlet and check whether matching pipe ends connect. */
  function pipeEndpoints(p){
    const mask=maskFor(p);
    if(p.visualType==='corner'){
      const cornerEndpoints={
        3:[{dr:0,dc:0,bit:1},{dr:1,dc:1,bit:2}],
        6:[{dr:0,dc:1,bit:2},{dr:1,dc:0,bit:4}],
        12:[{dr:1,dc:1,bit:4},{dr:0,dc:0,bit:8}],
        9:[{dr:1,dc:0,bit:8},{dr:0,dc:1,bit:1}]
      }[mask];
      return (cornerEndpoints||[]).map(endpoint=>({
        r:p.r+endpoint.dr,
        c:p.c+endpoint.dc,
        bit:endpoint.bit
      }));
    }
    const length=p.visualLength;
    const vertical=p.rotation%2===0;
    const firstBit=vertical?1:8;
    const secondBit=vertical?4:2;
    return [
      {r:p.r,c:p.c,bit:firstBit},
      {r:vertical?p.r+length-1:p.r,c:vertical?p.c:p.c+length-1,bit:secondBit}
    ].filter(endpoint=>mask&endpoint.bit);
  }
  function checkConnection(){
    const endpointMap=new Map();
    pipes.forEach(pipe=>pipeEndpoints(pipe).forEach(endpoint=>{
      const endpointKey=`${endpoint.r},${endpoint.c},${endpoint.bit}`;
      if(!endpointMap.has(endpointKey)) endpointMap.set(endpointKey,[]);
      endpointMap.get(endpointKey).push(pipe);
    }));
    const queue=[];const visited=new Map();
    // The fixed well outlet opens downward into the cell directly below it.
    pipes.forEach(pipe=>pipeEndpoints(pipe).forEach(endpoint=>{
      if(endpoint.r===SOURCE.r+1 && endpoint.c===SOURCE.c && endpoint.bit===1 && !visited.has(pipe.id)){
        queue.push(pipe);visited.set(pipe.id,pipe);
      }
    }));
    let reachedReservoir=false;
    while(queue.length){
      const pipe=queue.shift();
      pipeEndpoints(pipe).forEach(endpoint=>{
        const direction=DIRS.find(item=>item.bit===endpoint.bit);
        if(!direction)return;
        const nextR=endpoint.r+direction.dr,nextC=endpoint.c+direction.dc;
        if(inReservoir(nextR,nextC)){reachedReservoir=true;return;}
        const connected=endpointMap.get(`${nextR},${nextC},${direction.op}`)||[];
        connected.forEach(nextPipe=>{
          if(!visited.has(nextPipe.id)){visited.set(nextPipe.id,nextPipe);queue.push(nextPipe);}
        });
      });
    }
    if(reachedReservoir)winGame([...visited.values()]);
  }
  function winGame(connectedPipes=[]){
    if(won)return;won=true;
    const faucet=cellAt(3,14);const flow=document.createElement('div');flow.className='water-flow';faucet.appendChild(flow);
    connectedPipes.forEach(pipe=>pipe.el.classList.add('watered'));
    board.querySelector('.source-pipe').classList.add('watered');
    setTimeout(()=>{
      const best=route.length*2;
      const ratio=moves<=best?3:(moves<=best+Math.max(5,Math.ceil(best*.35))?2:1);
      starRating.textContent='★'.repeat(ratio)+'☆'.repeat(3-ratio);
      starMessage.textContent=ratio===3?'Perfect connection!':ratio===2?'Great work, water hero!':'You made it flow — well done!';
      document.getElementById('final-moves').textContent=moves;modal.classList.remove('hidden');
    },1200);
  }
})();
