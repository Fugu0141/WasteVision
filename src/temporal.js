import { resolveMaterialHint } from "./materials.js";

export function intersectionOverUnion(a,b) {
  const x1=Math.max(a.x,b.x), y1=Math.max(a.y,b.y);
  const x2=Math.min(a.x+a.width,b.x+b.width), y2=Math.min(a.y+a.height,b.y+b.height);
  const overlap=Math.max(0,x2-x1)*Math.max(0,y2-y1);
  const union=a.width*a.height+b.width*b.height-overlap;
  return union>0?overlap/union:0;
}

/**
 * Majority vote over nearby detections across frames.
 * Reduces label flicker; does NOT improve model classification accuracy.
 */
export function createTemporalStabilizer({
  minObservations=3, windowSize=5, maxMisses=1, iouThreshold=0.3
}={}) {
  if (!Number.isInteger(minObservations)||minObservations<1||
      !Number.isInteger(windowSize)||windowSize<minObservations||
      !Number.isInteger(maxMisses)||maxMisses<0||
      !Number.isFinite(iouThreshold)||iouThreshold<=0||iouThreshold>1) {
    throw new RangeError("Invalid temporal stabilizer options.");
  }
  let tracks=[],nextId=1;
  function update(detections=[]) {
    const matched=new Set();
    const sorted=[...detections].sort((a,b)=>(b.objectConfidence??0)-(a.objectConfidence??0));
    for (const item of sorted) {
      const box=item.boundingBox;
      if(!box || !(box.width>0 && box.height>0)) continue;
      let best=null,bestOverlap=iouThreshold;
      for(const track of tracks){
        if(matched.has(track.id)) continue;
        const overlap=intersectionOverUnion(track.box,box);
        if(overlap>=bestOverlap){best=track;bestOverlap=overlap;}
      }
      if(!best){
        best={id:nextId++,box:{...box},history:[],misses:0,latest:item};
        tracks.push(best);
      }else{
        const smooth=(a,b)=>0.35*a+0.65*b;
        best.box={
          x:smooth(best.box.x,box.x),y:smooth(best.box.y,box.y),
          width:smooth(best.box.width,box.width),height:smooth(best.box.height,box.height)
        };
      }
      best.misses=0;
      best.latest=item;
      best.history.push({object:item.object,score:item.objectConfidence});
      if(best.history.length>windowSize)best.history.shift();
      matched.add(best.id);
    }
    for(const track of tracks)if(!matched.has(track.id))track.misses++;
    tracks=tracks.filter(t=>t.misses<=maxMisses);
    const stable=[];
    for(const track of tracks){
      if(!matched.has(track.id))continue;
      const votes=new Map();
      for(const item of track.history)votes.set(item.object,(votes.get(item.object)??0)+1);
      const ranking=[...votes].sort((a,b)=>b[1]-a[1]);
      const winner=ranking[0];
      if(!winner||winner[1]<minObservations||
          (ranking[1]&&ranking[1][1]===winner[1]))continue;
      const label=winner[0];
      stable.push({
        object:label,
        // Do not attribute a different class's score to this stable class.
        objectConfidence:track.latest.object===label?track.latest.objectConfidence:null,
        ...resolveMaterialHint(label),
        boundingBox:{...track.box},
        stability:{observations:winner[1],window:track.history.length}
      });
    }
    return stable;
  }
  return {update,reset(){tracks=[];nextId=1;}};
}

// UI ranking heuristic, not a probability or a second ML model.
export function selectPrimaryObject(detections,width,height){
  if(!detections?.length)return null;
  if(!(width>0&&height>0))return detections[0];
  const rank=(d)=>{
    const b=d.boundingBox;
    const x=(b.x+b.width/2-width/2)/(width/2);
    const y=(b.y+b.height/2-height/2)/(height/2);
    const center=1-Math.min(1,Math.hypot(x,y)/Math.SQRT2);
    const area=Math.min(1,b.width*b.height/(width*height));
    return 0.55*(d.objectConfidence??0)+0.4*center+0.05*area;
  };
  return detections.reduce((a,b)=>rank(a)>rank(b)?a:b);
}
