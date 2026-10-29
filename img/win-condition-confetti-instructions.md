# Fix the Win Condition and Add Confetti

**Goal:** The game should declare a win when a chain of connected pipes runs from the well outlet to the reservoir. When that happens, confetti falls and the win dialog appears. The picture `img/win condition.png` shows a solved board, and this change turns it into code.

**Files to edit:** `script.js` and `styles.css`. Do not edit `index.html`.

Do the steps **in order**. Each step says what to find and what to put there.

---

## Why the old win check could never fire

Read this first so the changes make sense.

1. **Nothing could touch the start.** The check wanted a pipe with an open top end at row 4, col 14. But the well outlet already fills that cell and the game blocks it, so no pipe could ever be there.
2. **Invisible pipes.** Three out of four straight pipes were marked `hidden`. They were never drawn but they still counted for the connection, so the player couldn't see or fix them.
3. **The pieces didn't fit the solution.** The solution was a one-cell-wide path, but the real pieces are bigger (straights are 2–4 cells long and elbows are 2×2). Putting pieces back "where they belong" did not connect.

**The fix:** build the solution from the real pieces laid end to end. Start the connection check one cell below the outlet. Remove the hidden pieces.

## How the new check works

It is a "follow the pipe" search:

1. **Start:** is there a pipe with an open top end in the cell right below the well outlet?
2. **Chain:** from each open end, look at the next cell. Is there a pipe there whose open end faces back? If so, it is connected. Keep going.
3. **Finish:** if any open end of a connected pipe touches a reservoir cell, the player wins.

Pipes that are close but not facing each other do not count. Pipes that are not part of the chain do not light up.

---

## Step 1: `script.js`, add two helpers

Find this line (near the top, in the helper functions):

```js
const key = (r,c) => `${r},${c}`;
```

**Add these two lines directly above it:**

```js
const SOURCE = {r:4,c:14};
const inReservoir = (r,c) => r>=17 && r<=19 && c>=25 && c<=29;
```

`SOURCE` is the well outlet cell. `inReservoir` says whether a cell belongs to the reservoir (rows 17–19, columns 25–29).

## Step 2: `script.js`, delete the unused `rotationForMask` line

Find and **delete** this whole line (it is no longer used):

```js
const rotationForMask = (shape,mask) => { for(let rotation=0;rotation<4;rotation++) if(rotateMask(shapes[shape],rotation)===mask) return rotation; return 0; };
```

## Step 3: `script.js`, stop ignoring "hidden" pipes (three places)

**3a.** In `placementAllowed`:

Replace:

```js
!pipes.some(other=>!other.hidden && other!==p && visualCellsOverlap(p,r,c,other));
```

With:

```js
!pipes.some(other=>other!==p && visualCellsOverlap(p,r,c,other));
```

**3b.** In `renderPipes`:

Replace:

```js
pipes.filter(p=>!p.hidden).forEach(p=>{
```

With:

```js
pipes.forEach(p=>{
```

**3c.** In `pipeEndpoints`:

Replace:

```js
const length=p.hidden?1:p.visualLength;
```

With:

```js
const length=p.visualLength;
```

## Step 4: `script.js`, build the solution from real pieces

Everything in steps 4–6 is inside or next to the `buildLevel` function.

**4a.** Find the start of `buildLevel` where the route is created.

Replace:

```js
// A winding route from the well outlet (row 4, col 14) to the reservoir (row 19, col 27).
// Route pieces are shuffled into the underground work area so players must reposition and rotate them.
const start={r:4,c:14}, end={r:19,c:27};
route=makeRoute(start,end);
const routeKeys=new Set(route.map(p=>key(p.r,p.c)));
```

With:

```js
// The solution is a chain of real pieces laid end to end from the well outlet to the reservoir.
// The pieces are then scattered above ground so players must reposition and rotate them.
route=makeSolution();
const routeKeys=new Set(route.flatMap(spec=>visualCells({...spec,rotation:spec.solutionRotation},spec.solution.r,spec.solution.c)));
```

`routeKeys` is the list of cells the solution uses. Obstacles are kept off those cells so the level can always be solved.

## Step 5: `script.js`, simplify how pieces are scattered

Still in `buildLevel`, find the section that starts with `const occupied=new Set([key(3,14),key(19,27)]);` and ends at the line `const rotations=shuffle([0,1,2,3]);`.

**Delete everything from `const occupied=...` down to and including `const rotations=shuffle([0,1,2,3]);`** and put this in its place:

```js
// Start pieces above the green boundary, leaving the well-house footprint clear.
const slots=[];
for(let r=0;r<PIPE_START_ROWS;r++) for(let c=0;c<COLS;c++){
  if(!isUnavailableCell(r,c)) slots.push({r,c});
}
shuffle(slots);
// Shuffle which piece goes to which start slot; pieces are movable and rotatable.
// Keep the piece set exactly sufficient to form the solution.
const shuffledSpecs=route.slice(); shuffle(shuffledSpecs);
const usedStartCells=new Set();
shuffledSpecs.forEach(spec=>{
  let slot=null;
  let p={...spec,r:0,c:0,rotation:0,el:null};
  const rotations=shuffle([0,1,2,3]);
```

The lines that follow (`for(const rotation of rotations){ ... }` and the rest) stay exactly as they are.

Then find these two comment lines near the end of `buildLevel` and **delete the comments** (keep `renderPipes();`):

```js
// Place one locked source connector and target connector, both fixed to their structures.
```

```js
// Keep a predictable solvable level: piece route is available, but shuffled around the board.
```

## Step 6: `script.js`, replace the route functions

Find these three functions, which sit right after `buildLevel`:

```js
function makeRoute(start,end) { ... }
function requiredMask(path,i) { ... }
function shapeFromMask(mask) { ... }
```

**Delete all three** and put this in their place (keep `function shuffle(a){...}` right below it):

```js
function makeSolution() {
  /* Lay real pieces end to end from the well outlet to the reservoir. */
  // Pieces keep their true size (straights 2-4 cells, elbows 2x2), so putting every piece
  // back at its `solution` cell and rotation connects the well to the reservoir.
  const steps=[
    {straight:3},{turn:'E'},{straight:2},{turn:'S'},{straight:3},{turn:'E'},{straight:4},{turn:'S'}
  ];
  const specs=[];
  // The chain starts in the cell just below the fixed well outlet (row 4, col 14), heading south.
  let r=5,c=14,heading='S';
  steps.forEach(step=>{
    if(step.straight){
      const vertical=heading==='S';
      specs.push({shape:'straight',visualType:'straight',visualLength:step.straight,solutionRotation:vertical?0:1,rotation:0,solution:{r,c},id:specs.length});
      if(vertical) r+=step.straight; else c+=step.straight;
    } else {
      const toEast=step.turn==='E';
      // South-to-east uses the N+E elbow; east-to-south uses the S+W elbow (rotated twice).
      // Either way the elbow's top-left cell is where the pipe enters.
      specs.push({shape:'elbow',visualType:'corner',visualLength:2,solutionRotation:toEast?0:2,rotation:0,solution:{r,c},id:specs.length});
      if(toEast){r+=1;c+=2;} else {r+=2;c+=1;}
      heading=step.turn;
    }
  });
  return specs;
}
```

How to read `steps`: go down 3 cells, turn east, go 2 cells, turn south, go 3 cells, turn east, go 4 cells, turn south into the reservoir. That is 8 pieces. To change the puzzle, edit this list (keep a `turn` between every direction change, and make the last step a south turn that ends above the reservoir).

## Step 7: `script.js`, replace the connection check

Find `checkConnection`. Keep the first part that builds `endpointMap` (the lines up to and including `}));` after `endpointMap.get(endpointKey).push(pipe);`).

**Replace everything after that** (from `const queue=[];const visited=new Set();` to the end of the function) with:

```js
  const queue=[];const visited=new Map();
  // 1. START: the fixed well outlet fills row 4, col 14 and opens downward,
  //    so a pipe must have an open north end in the cell right below it.
  pipes.forEach(pipe=>pipeEndpoints(pipe).forEach(endpoint=>{
    if(endpoint.r===SOURCE.r+1 && endpoint.c===SOURCE.c && endpoint.bit===1 && !visited.has(pipe.id)){
      queue.push(pipe);visited.set(pipe.id,pipe);
    }
  }));
  // 2. CHAIN: follow every open end to a pipe whose open end faces back at it.
  let reachedReservoir=false;
  while(queue.length){
    const pipe=queue.shift();
    pipeEndpoints(pipe).forEach(endpoint=>{
      const direction=DIRS.find(item=>item.bit===endpoint.bit);
      if(!direction)return;
      const nextR=endpoint.r+direction.dr,nextC=endpoint.c+direction.dc;
      // 3. FINISH: an open end of a connected pipe touches the reservoir.
      if(inReservoir(nextR,nextC)){reachedReservoir=true;return;}
      const connected=endpointMap.get(`${nextR},${nextC},${direction.op}`)||[];
      connected.forEach(nextPipe=>{
        if(!visited.has(nextPipe.id)){visited.set(nextPipe.id,nextPipe);queue.push(nextPipe);}
      });
    });
  }
  if(reachedReservoir) winGame([...visited.values()]);
}
```

(The closing `}` ends `checkConnection`. Make sure there is only one.)

## Step 8: `script.js`, add confetti and update `winGame`

Find `function winGame(){` and the lines inside it down to `const best=route.length+2;`.

**Replace this:**

```js
function winGame(){
  if(won)return;won=true;
  const reservoirWater=document.getElementById('reservoir-water');if(reservoirWater)reservoirWater.style.height='85%';
  const faucet=cellAt(3,14);const flow=document.createElement('div');flow.className='water-flow';faucet.appendChild(flow);
  board.querySelectorAll('.pipe-piece, .source-pipe').forEach(el=>el.classList.add('watered'));
  setTimeout(()=>{
    const best=route.length+2;
```

**With this** (a new `launchConfetti` function, then the updated `winGame` start):

```js
function launchConfetti(){
  /* Draw a short burst of falling confetti on a full-screen canvas, then remove it. */
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas=document.createElement('canvas');canvas.className='confetti-canvas';
  document.body.appendChild(canvas);
  const ctx=canvas.getContext('2d');
  const resize=()=>{canvas.width=window.innerWidth;canvas.height=window.innerHeight;};
  resize();window.addEventListener('resize',resize);
  const colors=['#ffd500','#22a8d5','#84b82a','#ffffff','#b56c35'];
  const pieces=Array.from({length:160},()=>({
    x:Math.random()*canvas.width,
    y:-20-Math.random()*canvas.height*0.5,
    w:6+Math.random()*8,h:8+Math.random()*10,
    vx:-2+Math.random()*4,vy:2+Math.random()*4,
    angle:Math.random()*Math.PI*2,spin:-0.2+Math.random()*0.4,
    color:colors[Math.floor(Math.random()*colors.length)]
  }));
  const start=performance.now(),duration=4500;
  const frame=now=>{
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;p.angle+=p.spin;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      ctx.fillStyle=p.color;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();
    });
    if(now-start<duration) requestAnimationFrame(frame);
    else{window.removeEventListener('resize',resize);canvas.remove();}
  };
  requestAnimationFrame(frame);
}
function winGame(connectedPipes=[]){
  if(won)return;won=true;
  launchConfetti();
  const reservoirWater=document.getElementById('reservoir-water');if(reservoirWater)reservoirWater.style.height='85%';
  const faucet=cellAt(3,14);const flow=document.createElement('div');flow.className='water-flow';faucet.appendChild(flow);
  // Only the pipes that carry water from the well to the reservoir light up.
  connectedPipes.forEach(pipe=>pipe.el.classList.add('watered'));
  board.querySelector('.source-pipe').classList.add('watered');
  setTimeout(()=>{
    const best=route.length*2;
```

Everything below `const best=...` in `winGame` stays the same.

## Step 9: `styles.css`, style the confetti canvas

Find `.water-flow {` and **add this rule directly above it:**

```css
.confetti-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 60;
}
```

`z-index: 60` puts the confetti above the win dialog (which is 50). `pointer-events: none` lets clicks pass through it.

---

## Check your work

1. Open `index.html`, click **Start**. Eight pipes (4 straight, 4 elbow) should be scattered in the sky area, all visible. The game should not be won yet.
2. Solve it. The solved shape is the one in `img/win condition.png`: from the outlet, down, right, down, right, down into the reservoir. Rotate with **R** and drag pieces. Elbows are 2×2, straights are 2–4 cells long.
3. While the chain is incomplete (even one piece away), nothing should happen.
4. When the last piece connects the chain to the reservoir:
   - confetti falls for about 4–5 seconds,
   - the connected pipes show the water animation,
   - the win dialog appears after about a second.
5. Click **Play again**. The next level should start with no confetti left on screen.
6. Click **Restart level** mid-game. The board should reset and nothing should be won.
7. Open the console (F12). There should be no red errors.

## Troubleshooting

| Problem | Likely cause |
| --- | --- |
| `makeRoute is not defined` | Step 4a missed. `buildLevel` still calls `makeRoute`. |
| `makeSolution is not defined` | Step 6 missed or the function was pasted inside another function. |
| `requiredMask` / `shapeFromMask` errors | An old call is left behind. Search the file for those names; there should be none. |
| Some pieces never appear | Step 5 was not fully applied. Search `script.js` for `hidden`; the only matches should be `classList` calls for the title screen and modal. |
| Connected but no win | The pipe next to the well isn't aligned. The first pipe must have its top end at row 5, column 14, directly under the outlet. |
| Wins too early or never resets | `const visited=new Set()` wasn't changed to `new Map()` in Step 7. |
| Confetti appears behind the dialog | `.confetti-canvas` is missing `z-index: 60` (Step 9). |
| No confetti but the win works | Your computer is set to "reduce motion". That setting turns confetti off on purpose. |

## Known limits

- The level is the same shape every time. Only the obstacles and the starting positions change with the level number.
- Pipes can still be rotated into spots they don't fit (see the earlier review). That does not affect the win check.
- The old reservoir water animation was removed when the SVG reservoir was added, so winning shows confetti but not a rising water level.
